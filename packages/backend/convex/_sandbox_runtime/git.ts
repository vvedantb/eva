"use node";

import type { GenericActionCtx } from "convex/server";
import { quote } from "shell-quote";
import { formatDurationMsShort } from "@eva/shared/duration";
import { redactSecrets } from "@eva/shared/redactSecrets";
import {
  AUTO_PUBLISH_BRANCH_GIT_CONFIG,
  COMMIT_EXCLUDE_PATHSPECS,
} from "@eva/shared/gitDefaults";
import {
  mintSandboxGitToken,
  SANDBOX_GIT_WRITE,
  type SandboxGitAccess,
} from "../githubAuth";
import type { DataModel } from "../_generated/dataModel";
import type {
  SandboxClient,
  SandboxHandle,
  SandboxMount,
} from "../_sandbox/provider";
import {
  execHandle,
  LEGACY_WORKSPACE_DIR,
  WORKSPACE_DIR,
  SNAPSHOT_SANDBOX_READY_TIMEOUT_SECONDS,
  DEFAULT_SANDBOX_READY_TIMEOUT_SECONDS,
  RESUME_READY_TIMEOUT_SECONDS,
  bootstrapVercelDocker,
  ensureSandboxRunning,
  withTimeout,
  workspaceDirShell,
} from "./helpers";
import {
  detectPackageManager,
  installPythonDependenciesBestEffort,
} from "./devServer";
import { isSandboxGoneError } from "./sandboxErrors";
import { writeSandboxFile } from "./sandboxFiles";
import {
  deleteSandboxAndCredentials,
  ensureGitCredentialHelper,
} from "./gitCredentials";
import { isMissingRemoteRefFetchFailure } from "../_git/remoteRef";
import { gitRemoteAuthPrefix } from "./gitRemoteCommand";
import {
  isChatSideBranch,
  isEvaOwnedBranch,
  parseGitNameOnlyList,
  rewrittenBranchIsOwnHistory,
  rewrittenBranchPublishError,
} from "./divergedPublish";
import { ensureSwapFile } from "./swap";
import { PACKAGE_HELPER_SCRIPT, pkgInstall } from "./packageManager";
import {
  AGENT_CLI_PATH_LINE,
  COREPACK_SANDBOX_ENV,
} from "../_sandbox/vercelEnvFile";
import {
  DRIVE_CACHE_ENV,
  DRIVE_CACHE_READER,
  DRIVE_CACHE_WRITER,
  DRIVE_MOUNT_PATH,
  driveCacheName,
  driveCacheSetupScript,
  type DriveCacheRole,
} from "../_sandbox/driveCache";
import {
  EVA_ENV_FILE,
  ensureEvaEnvInteractiveHookScript,
  renderEvaEnvFile,
  VERCEL_DEFAULT_EXPOSED_PORTS,
} from "../_sandbox/vercelProvider";
import { buildSandboxLabels } from "../_sandbox/tags";
import { errorMessage } from "@vvedantb/server";
import { sleep } from "../_shared/async";

type ActionCtx = GenericActionCtx<DataModel>;

export type SandboxLifecycle = {
  autoStopInterval: number;
  autoArchiveInterval?: number;
  autoDeleteInterval?: number;
  ephemeral?: boolean;
  labels?: Record<string, string>;
};

export type RepoSyncStrategy =
  | { mode: "all" }
  | { mode: "branches"; branchNames: string[] }
  | { mode: "none" };

const SESSION_LIFECYCLE: SandboxLifecycle = {
  autoStopInterval: 24 * 60,
  // Auto-archive after 1 day; no auto-delete.
  autoArchiveInterval: 1 * 24 * 60,
};

const EPHEMERAL_LIFECYCLE: SandboxLifecycle = {
  autoStopInterval: 24 * 60,
  ephemeral: true,
};

export { SESSION_LIFECYCLE, EPHEMERAL_LIFECYCLE };

const REPO_CLONE_TIMEOUT_SECONDS = 300;
const PNPM_INSTALL_TIMEOUT_SECONDS = 900;
const YARN_INSTALL_TIMEOUT_SECONDS = 900;
const NPM_INSTALL_TIMEOUT_SECONDS = 900;

function logGit(message: string): void {
  console.log(`[sandbox][git] ${message}`);
}

function isSandboxExecTimeout(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes("sandbox exec") && lower.includes("timed out")) ||
    lower.includes("command execution timeout")
  );
}

async function cleanupTimedOutGitState(sandbox: SandboxHandle): Promise<void> {
  logGit(
    "cleanupTimedOutGitState: killing stale git processes and removing lock files",
  );
  try {
    const workspaceDir = workspaceDirShell();
    await execHandle(
      sandbox,
      `pkill -9 -f '^git($| )' 2>/dev/null || true; rm -f ${workspaceDir}/.git/index.lock ${workspaceDir}/.git/HEAD.lock ${workspaceDir}/.git/FETCH_HEAD.lock ${workspaceDir}/.git/ORIG_HEAD.lock 2>/dev/null || true`,
      10,
      "/",
    );
    logGit("cleanupTimedOutGitState: cleanup completed");
  } catch (error) {
    logGit(
      `cleanupTimedOutGitState: cleanup failed (best-effort): ${errorMessage(error)}`,
    );
  }
}

const SANDBOX_GIT_LOCK_PATH = "/tmp/eva-git.lock";

function withSandboxGitLock(command: string, timeoutSeconds: number): string {
  return `flock -w ${Math.max(1, timeoutSeconds - 1)} ${SANDBOX_GIT_LOCK_PATH} bash -c ${quote([command])}`;
}

async function execGitCommand(
  sandbox: SandboxHandle,
  command: string,
  timeoutSeconds: number,
): Promise<string> {
  const sanitized = redactSecrets(command);
  const startedAt = Date.now();
  logGit(`exec [timeout=${timeoutSeconds}s]: ${sanitized}`);
  try {
    const result = await execHandle(
      sandbox,
      withSandboxGitLock(command, timeoutSeconds),
      timeoutSeconds,
    );
    logGit(
      `exec completed in ${formatDurationMsShort(Date.now() - startedAt)}: ${sanitized}`,
    );
    return result;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const message = errorMessage(error);
    logGit(
      `exec failed after ${formatDurationMsShort(elapsed)} [timeout=${timeoutSeconds}s]: ${sanitized} — ${redactSecrets(message)}`,
    );
    if (isSandboxExecTimeout(message)) {
      await cleanupTimedOutGitState(sandbox);
    }
    throw error;
  }
}

const SDK_TIMEOUT_BUFFER_MS = 15_000;

async function execSdkGitOperation<T>(
  sandbox: SandboxHandle,
  label: string,
  fn: () => Promise<T>,
  timeoutSeconds: number,
): Promise<T> {
  const startedAt = Date.now();
  logGit(`sdk [timeout=${timeoutSeconds}s]: ${label}`);
  try {
    const result = await withTimeout(
      fn(),
      timeoutSeconds * 1000 + SDK_TIMEOUT_BUFFER_MS,
      `sdk ${label} (${timeoutSeconds}s)`,
    );
    logGit(
      `sdk completed in ${formatDurationMsShort(Date.now() - startedAt)}: ${label}`,
    );
    return result;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const message = errorMessage(error);
    logGit(
      `sdk failed after ${formatDurationMsShort(elapsed)} [timeout=${timeoutSeconds}s]: ${label} — ${message}`,
    );
    if (isSandboxExecTimeout(message)) {
      await cleanupTimedOutGitState(sandbox);
    }
    throw error;
  }
}

/** Wraps a git operation with timing logs and error reporting. */
export async function runLoggedGitStep<T>(
  label: string,
  details: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logGit(`${label} started${details ? ` (${details})` : ""}`);
  try {
    const result = await fn();
    logGit(
      `${label} completed in ${formatDurationMsShort(Date.now() - startedAt)}${details ? ` (${details})` : ""}`,
    );
    return result;
  } catch (error) {
    logGit(
      `${label} failed after ${formatDurationMsShort(Date.now() - startedAt)}${details ? ` (${details})` : ""}: ${errorMessage(error)}`,
    );
    throw error;
  }
}

function normalizeBranchNames(branchNames: string[]): string[] {
  const normalized: string[] = [];
  for (const branchName of branchNames) {
    const trimmed = branchName.trim();
    if (trimmed.length === 0 || normalized.includes(trimmed)) {
      continue;
    }
    normalized.push(trimmed);
  }
  return normalized;
}

function isSafeBranchName(branchName: string): boolean {
  return /^[^\s\\:?*[~^]+$/.test(branchName) && !branchName.includes("..");
}

/**
 * Transport-level hiccup (exec timeout, dropped connection, TLS, gateway 5xx),
 * never a real command failure. Sandbox setup uses this scope alone, because
 * it deletes and recreates the VM on retry.
 */
export function isTransientTransportError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    isSandboxExecTimeout(message) ||
    lower.includes("status code 502") ||
    lower.includes("status code 503") ||
    lower.includes("status code 504") ||
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("gnutls recv error") ||
    lower.includes("tls connection was non-properly terminated") ||
    lower.includes("remote end hung up unexpectedly") ||
    lower.includes("connection reset by peer") ||
    lower.includes("rpc failed") ||
    lower.includes("early eof") ||
    lower.includes("http/2 stream")
  );
}

/**
 * Transient git push/fetch/clone failure: transport hiccups plus GitHub-side
 * 500s and the installation-token race (401 or auth prompt right after a
 * token rotation). Too broad for sandbox setup, where an auth failure is
 * permanent.
 */
export function isRetryableGitNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    isTransientTransportError(message) ||
    lower.includes("internal server error") ||
    lower.includes("status code 500") ||
    lower.includes("status code 401") ||
    lower.includes("http 401") ||
    lower.includes("authentication failed") ||
    lower.includes("could not read username")
  );
}

/**
 * Session checkout and dependency install: transport hiccups plus a bare
 * "network" (npm "network request … failed", git "Network is unreachable").
 */
export function isRetryableSessionStepError(message: string): boolean {
  return (
    isTransientTransportError(message) ||
    message.toLowerCase().includes("network")
  );
}

function isNonFastForwardPushError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("non-fast-forward") ||
    lower.includes("stale info") ||
    lower.includes("fetch first") ||
    (lower.includes("[rejected]") && lower.includes("failed to push"))
  );
}

/**
 * Retries a sandbox step on transient failures with linear backoff
 * (`delayStepMs * attempt`). `isRetryable` picks the scope; git operations
 * default to `isRetryableGitNetworkError`.
 */
export async function retryGitNetworkOperation<T>(
  label: string,
  details: string,
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    delayStepMs = 1000,
    isRetryable = isRetryableGitNetworkError,
  }: {
    maxAttempts?: number;
    delayStepMs?: number;
    isRetryable?: (message: string) => boolean;
  } = {},
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fn();
      if (attempt > 1) {
        logGit(
          `${label} recovered on retry ${attempt}/${maxAttempts}${details ? ` (${details})` : ""}`,
        );
      }
      return result;
    } catch (error) {
      const message = errorMessage(error);
      const shouldRetry = attempt < maxAttempts && isRetryable(message);
      if (!shouldRetry) {
        throw error;
      }
      const delayMs = delayStepMs * attempt;
      logGit(
        `${label} retrying in ${delayMs}ms after attempt ${attempt}/${maxAttempts}${details ? ` (${details})` : ""}: ${message}`,
      );
      await sleep(delayMs);
    }
  }
  throw new Error(
    `${label} failed without returning a result${details ? ` (${details})` : ""}`,
  );
}

/** Creates a new sandbox with GitHub auth and git configuration. */
export async function createSandbox(
  client: SandboxClient,
  installationId: number,
  sandboxEnvVars: Record<string, string>,
  lifecycle: SandboxLifecycle,
  snapshotName?: string,
  readyTimeoutSeconds?: number,
  onSandboxAcquired?: (sandbox: SandboxHandle) => Promise<void>,
  forkFrom?: string,
  /**
   * How this sandbox uses the repo's shared package cache Drive. Defaults to
   * the read-only reader role; only the seed-prep and group-builder sandboxes
   * pass `writer`, since a Drive allows one read-write mount at a time.
   * See ../_sandbox/driveCache.ts.
   */
  driveCacheRole: DriveCacheRole = DRIVE_CACHE_READER,
  /** vCPUs; omit for the provider default (see `SandboxCreateParams.vcpus`). */
  vcpus?: number,
  /** The GitHub token written into the env file (`mintSandboxGitToken`). */
  gitAccess: SandboxGitAccess = SANDBOX_GIT_WRITE,
): Promise<SandboxHandle> {
  const repoId = sandboxEnvVars.REPO_ID;
  const driveMountMode: SandboxMount["mode"] =
    driveCacheRole === DRIVE_CACHE_WRITER ? "read-write" : "snapshot";
  const details = [
    `installation=${installationId}`,
    forkFrom ? `forkFrom=${forkFrom}` : "forkFrom=none",
    snapshotName ? `snapshot=${snapshotName}` : "snapshot=none",
    lifecycle.ephemeral ? "ephemeral=true" : "ephemeral=false",
    `driveCache=${repoId ? driveCacheRole : "none"}`,
  ].join(", ");
  return await runLoggedGitStep("createSandbox", details, async () => {
    const timeoutSeconds =
      readyTimeoutSeconds ??
      (snapshotName || forkFrom
        ? SNAPSHOT_SANDBOX_READY_TIMEOUT_SECONDS
        : DEFAULT_SANDBOX_READY_TIMEOUT_SECONDS);

    const tokenPromise = mintSandboxGitToken(installationId, gitAccess);

    const sandbox = await client.create({
      snapshot: snapshotName,
      ...(forkFrom ? { forkFrom } : {}),
      ports: [...VERCEL_DEFAULT_EXPOSED_PORTS],
      envVars: {
        VNC_RESOLUTION: "1920x1080",
        ...sandboxEnvVars,
      },
      lifecycle: {
        autoStopMinutes: lifecycle.autoStopInterval,
        autoArchiveMinutes: lifecycle.autoArchiveInterval,
        autoDeleteMinutes: lifecycle.autoDeleteInterval,
        ephemeral: lifecycle.ephemeral,
        labels: buildSandboxLabels({
          ephemeral: lifecycle.ephemeral,
          labels: lifecycle.labels,
          repoId: sandboxEnvVars.REPO_ID,
        }),
      },
      readyTimeoutSeconds: timeoutSeconds,
      ...(vcpus !== undefined ? { vcpus } : {}),
      mounts: repoId
        ? [
            {
              path: DRIVE_MOUNT_PATH,
              volumeName: driveCacheName(repoId),
              mode: driveMountMode,
            },
          ]
        : undefined,
    });
    logGit(
      `createSandbox: created id=${sandbox.id}, cpu=${sandbox.cpu}, memory=${sandbox.memory}, disk=${sandbox.disk}`,
    );
    try {
      const { token } = await tokenPromise;
      await runLoggedGitStep("createSandbox.writeEvaEnv", sandbox.id, () =>
        writeSandboxFile(
          sandbox,
          EVA_ENV_FILE,
          renderEvaEnvFile({
            VNC_RESOLUTION: "1920x1080",
            ...COREPACK_SANDBOX_ENV,
            ...DRIVE_CACHE_ENV,
            ...sandboxEnvVars,
            GITHUB_TOKEN: token,
            INSTALLATION_ID: String(installationId),
          }) + AGENT_CLI_PATH_LINE,
        ),
      );
      if (onSandboxAcquired) {
        await onSandboxAcquired(sandbox);
      }
      await runLoggedGitStep("createSandbox.driveCache", sandbox.id, () =>
        execHandle(sandbox, driveCacheSetupScript(), 60, "/"),
      );
      const appSlug = process.env.GITHUB_APP_SLUG;
      const botUserId = process.env.GITHUB_BOT_USER_ID;
      if (!appSlug || !botUserId) {
        throw new Error(
          "GITHUB_APP_SLUG and GITHUB_BOT_USER_ID must be set in Convex env",
        );
      }
      await Promise.all([
        runLoggedGitStep("createSandbox.ensureSwap", sandbox.id, () =>
          ensureSwapFile(sandbox),
        ),
        runLoggedGitStep(
          "createSandbox.ensureEvaEnvInteractiveHook",
          sandbox.id,
          () =>
            execHandle(sandbox, ensureEvaEnvInteractiveHookScript(), 30, "/"),
        ).catch((hookError) => {
          console.warn(
            `[sandbox][git] createSandbox.ensureEvaEnvInteractiveHook failed on ${sandbox.id} (continuing): ${errorMessage(hookError)}`,
          );
        }),
        runLoggedGitStep("createSandbox.ensureJq", sandbox.id, () =>
          execHandle(
            sandbox,
            `${PACKAGE_HELPER_SCRIPT}\ncommand -v jq >/dev/null 2>&1 || ${pkgInstall("jq")} || true`,
            120,
          ),
        ),
        runLoggedGitStep("createSandbox.gitConfig", sandbox.id, () =>
          execHandle(
            sandbox,
            [
              `git config --global user.name "${appSlug}[bot]"`,
              `git config --global user.email "${botUserId}+${appSlug}[bot]@users.noreply.github.com"`,
              "git config --global --add safe.directory '*'",
              "git config --global pull.rebase true",
            ].join(" && "),
            10,
          ),
        ),
      ]);

      return sandbox;
    } catch (error) {
      console.warn(
        `[sandbox][git] createSandbox: post-create setup failed for ${sandbox.id}; deleting orphan: ${errorMessage(error)}`,
      );
      try {
        await sandbox.delete();
      } catch (deleteError) {
        console.warn(
          `[sandbox][git] createSandbox: orphan delete failed for ${sandbox.id}: ${errorMessage(deleteError)}`,
        );
      }
      throw error;
    }
  });
}

function bareGitHubRepoUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}.git`;
}

export type FetchOriginResult = {
  fetched: boolean;
};

/**
 * Fetches refs from the GitHub remote origin, optionally pruning stale refs.
 * Always fetches full history (no --depth) — shallow clones cause issues with rebasing, blame, and merges.
 *
 * Auth comes from the eva git credential helper installed at sandbox
 * bootstrap; the remote URL no longer carries a token.
 *
 * A missing specific ref (git exit 128 "couldn't find remote ref") is a
 * handled outcome — deleted automation branches, never-pushed task branches —
 * not a thrown command failure.
 */
export async function fetchOrigin(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  ref?: string,
  opts?: {
    prune?: boolean;
    timeoutSeconds?: number;
    retryAttempts?: number;
  },
): Promise<FetchOriginResult> {
  const details = `${owner}/${name}, ref=${ref ?? "all"}, prune=${
    opts?.prune === false ? "false" : "true"
  }`;
  return await runLoggedGitStep("fetchOrigin", details, async () => {
    const repoUrl = bareGitHubRepoUrl(owner, name);
    const workspaceDir = workspaceDirShell();
    const pruneArg = opts?.prune === false ? "" : " --prune";
    const refArg = ref ? ` ${quote([ref])}` : "";
    try {
      await retryGitNetworkOperation(
        "fetchOrigin",
        details,
        async () => {
          await execGitCommand(
            sandbox,
            `${gitRemoteAuthPrefix(workspaceDir, repoUrl)} git fetch --no-tags${pruneArg} origin${refArg}`,
            opts?.timeoutSeconds ?? 240,
          );
        },
        { maxAttempts: opts?.retryAttempts },
      );
      return { fetched: true };
    } catch (error) {
      if (ref && isMissingRemoteRefFetchFailure(error)) {
        logGit(
          `fetchOrigin: remote ref ${ref} is missing — continuing without it`,
        );
        return { fetched: false };
      }
      throw error;
    }
  });
}

/**
 * Fetches specific branch refs from origin, falling back to individual fetches on missing refs.
 * Always fetches full history (no --depth) — shallow clones cause issues with rebasing, blame, and merges.
 *
 * Auth comes from the eva git credential helper installed at sandbox
 * bootstrap; the remote URL no longer carries a token.
 */
export async function fetchBranchRefs(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  branchNames: string[],
  opts?: {
    prune?: boolean;
    timeoutSeconds?: number;
    retryAttempts?: number;
    workspaceDir?: string;
  },
): Promise<string[]> {
  const details = `${owner}/${name}, branches=${branchNames.join(",")}, timeout=${opts?.timeoutSeconds ?? 240}`;
  return await runLoggedGitStep("fetchBranchRefs", details, async () => {
    const normalized = normalizeBranchNames(branchNames);
    if (normalized.length === 0) {
      return [];
    }
    const repoUrl = bareGitHubRepoUrl(owner, name);
    const pruneArg = opts?.prune === false ? "" : " --prune";
    const timeoutSeconds = opts?.timeoutSeconds ?? 240;
    const workspaceDir = opts?.workspaceDir ?? workspaceDirShell();
    const refspecs = normalized.map(
      (b) => `+refs/heads/${b}:refs/remotes/origin/${b}`,
    );
    const refspecArgs = refspecs.map((r) => quote([r])).join(" ");
    const setupAndFetch = `${gitRemoteAuthPrefix(workspaceDir, repoUrl)} git fetch --no-tags${pruneArg} origin`;
    return await retryGitNetworkOperation(
      "fetchBranchRefs",
      details,
      async () => {
        try {
          await execGitCommand(
            sandbox,
            `${setupAndFetch} ${refspecArgs}`,
            timeoutSeconds,
          );
          return normalized;
        } catch (error) {
          if (!isMissingRemoteRefFetchFailure(error)) {
            throw error;
          }
          const fetchedBranches: string[] = [];
          for (const [index, refspec] of refspecs.entries()) {
            if (
              index === refspecs.length - 1 &&
              fetchedBranches.length === index
            ) {
              break;
            }
            try {
              await execGitCommand(
                sandbox,
                `${setupAndFetch} ${quote([refspec])}`,
                timeoutSeconds,
              );
              const fetchedBranch = normalized[index];
              if (fetchedBranch) {
                fetchedBranches.push(fetchedBranch);
              }
            } catch (e) {
              if (!isMissingRemoteRefFetchFailure(e)) {
                throw e;
              }
            }
          }
          return fetchedBranches;
        }
      },
      { maxAttempts: opts?.retryAttempts },
    );
  });
}

/** Syncs the sandbox repo with the remote using the given strategy. */
export async function syncRepo(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  strategy: RepoSyncStrategy,
): Promise<void> {
  const details =
    strategy.mode === "branches"
      ? `${owner}/${name}, strategy=branches(${strategy.branchNames.join(",")})`
      : `${owner}/${name}, strategy=${strategy.mode}`;
  await runLoggedGitStep("syncRepo", details, async () => {
    if (strategy.mode === "none") {
      return;
    }
    if (strategy.mode === "all") {
      await fetchOrigin(sandbox, owner, name, undefined, {
        prune: true,
        timeoutSeconds: 180,
      });
      return;
    }
    await fetchBranchRefs(sandbox, owner, name, strategy.branchNames, {
      prune: false,
      timeoutSeconds: 120,
    });
  });
}

async function remoteTrackingBranchExists(
  sandbox: SandboxHandle,
  branch: string,
): Promise<boolean> {
  const workspaceDir = workspaceDirShell();
  const result = (
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git rev-parse --verify --quiet refs/remotes/origin/${quote([branch])} >/dev/null 2>&1 && printf yes || printf no`,
      10,
    )
  ).trim();
  return result === "yes";
}

/** Resolves the best available base ref: prefers origin/<base>, falls back to local, then HEAD. */
export async function resolveBaseTarget(
  sandbox: SandboxHandle,
  baseBranch: string,
): Promise<{ ref: string; source: "remote" | "local" | "head" }> {
  if (await remoteTrackingBranchExists(sandbox, baseBranch)) {
    return { ref: `origin/${baseBranch}`, source: "remote" };
  }
  // Check local branches via SDK
  const branchList = await execSdkGitOperation(
    sandbox,
    `branches`,
    () => sandbox.git.branches(WORKSPACE_DIR),
    10,
  );
  if (branchList.branches.includes(baseBranch)) {
    return { ref: baseBranch, source: "local" };
  }
  return { ref: "HEAD", source: "head" };
}

async function resolveBranchStartTarget(
  sandbox: SandboxHandle,
  branchName: string,
  baseBranch: string,
): Promise<{
  ref: string;
  source: "localBranch" | "remoteBranch" | "base";
}> {
  // Check local branches via SDK
  const branchList = await execSdkGitOperation(
    sandbox,
    `branches`,
    () => sandbox.git.branches(WORKSPACE_DIR),
    10,
  );
  if (branchList.branches.includes(branchName)) {
    return { ref: branchName, source: "localBranch" };
  }
  if (await remoteTrackingBranchExists(sandbox, branchName)) {
    return { ref: `origin/${branchName}`, source: "remoteBranch" };
  }
  const { ref } = await resolveBaseTarget(sandbox, baseBranch);
  return { ref, source: "base" };
}

async function pinBranchUpstream(
  sandbox: SandboxHandle,
  branchName: string,
): Promise<void> {
  if (!isSafeBranchName(branchName)) return;
  const workspaceDir = workspaceDirShell();
  try {
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && ${pinBranchUpstreamShell(branchName)}`,
      15,
    );
  } catch (error) {
    logGit(
      `pinBranchUpstream: failed for ${branchName} (continuing): ${errorMessage(error)}`,
    );
  }
}

function pinBranchUpstreamShell(branchName: string): string {
  return `git config ${quote([`branch.${branchName}.remote`])} origin && git config ${quote([`branch.${branchName}.merge`])} ${quote([`refs/heads/${branchName}`])}`;
}

/**
 * Matches git's unresolved-index refusals: "<path>: needs merge", "error: you
 * need to resolve your current index first", "you have unmerged files", and
 * "MERGE_HEAD exists". Kept narrow on purpose — anything else (auth, network,
 * missing refs) must keep failing loudly, not be reset away.
 */
export function isUnresolvedGitIndexError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("needs merge") ||
    lower.includes("resolve your current index first") ||
    lower.includes("unmerged files") ||
    lower.includes("merge_head exists") ||
    lower.includes("not concluded your merge")
  );
}

/**
 * Aborts a merge/rebase/cherry-pick/revert left in progress on a reused
 * sandbox, then clears any unmerged entries still in the index. An agent run
 * that dies mid-merge leaves the VM in this state, and every later checkout
 * refuses with "needs merge; you need to resolve your current index first" —
 * so session reuse could never start again on that box. Aborting restores the
 * pre-operation HEAD: committed work survives; only the unfinished conflicted
 * attempt is discarded.
 */
export async function recoverUnresolvedGitIndex(
  sandbox: SandboxHandle,
): Promise<void> {
  const workspaceDir = workspaceDirShell();
  await runLoggedGitStep("recoverUnresolvedGitIndex", WORKSPACE_DIR, () =>
    execGitCommand(
      sandbox,
      [
        `cd ${workspaceDir}`,
        `if [ -f .git/MERGE_HEAD ]; then echo "aborting in-progress merge"; git merge --abort || true; fi`,
        `if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then echo "aborting in-progress rebase"; git rebase --abort || true; fi`,
        `if [ -f .git/CHERRY_PICK_HEAD ]; then echo "aborting in-progress cherry-pick"; git cherry-pick --abort || true; fi`,
        `if [ -f .git/REVERT_HEAD ]; then echo "aborting in-progress revert"; git revert --abort || true; fi`,
        `if [ -n "$(git ls-files --unmerged)" ]; then echo "resetting unmerged index entries"; git reset --merge || git reset --hard HEAD; fi`,
      ].join(" && "),
      60,
    ),
  );
}

/**
 * Returns the branch the user moved a reused sandbox to, or null when the
 * resume should check out the session branch. A local session branch proves
 * the startup checkout once ran, so being elsewhere was a deliberate switch;
 * without it (the eva/65 failed-checkout shape) HEAD is just where setup left it.
 */
export async function getUserCheckedOutBranch(
  sandbox: SandboxHandle,
  branchName: string,
): Promise<string | null> {
  const workspaceDir = workspaceDirShell();
  const quotedLocalHeadRef = quote([`refs/heads/${branchName}`]);
  const [currentBranch = "", localBranchState = ""] = (
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && echo "$(git branch --show-current)|$( (git show-ref --verify --quiet ${quotedLocalHeadRef} && echo exists) || echo missing)"`,
      10,
    )
  )
    .trim()
    .split("|");
  if (
    currentBranch === "" ||
    currentBranch === branchName ||
    localBranchState !== "exists"
  ) {
    return null;
  }
  return currentBranch;
}

/** Checks out a session branch, creating it from a remote or base ref if needed. */
export async function checkoutSessionBranch(
  sandbox: SandboxHandle,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const details = `branch=${branchName}, base=${baseBranch}`;
  await runLoggedGitStep("checkoutSessionBranch", details, async () => {
    const quotedBranch = quote([branchName]);
    const quotedRemoteBranch = quote([`origin/${branchName}`]);
    const quotedBase = quote([baseBranch]);
    const pinUpstream = isSafeBranchName(branchName)
      ? `{ ${pinBranchUpstreamShell(branchName)}; } || echo "pinBranchUpstream failed (continuing)" >&2`
      : "true";
    await execGitCommand(
      sandbox,
      [
        `cd ${workspaceDirShell()} || exit 1`,
        `if git show-ref --verify --quiet refs/heads/${quotedBranch}; then`,
        `  if [ "$(git branch --show-current)" != ${quotedBranch} ]; then git checkout ${quotedBranch} || exit 1; fi`,
        "else",
        `  if git rev-parse --verify --quiet refs/remotes/origin/${quotedBase} >/dev/null 2>&1; then start=${quote([`origin/${baseBranch}`])}`,
        `  elif git show-ref --verify --quiet refs/heads/${quotedBase}; then start=${quotedBase}`,
        "  else start=HEAD; fi",
        `  git checkout -f -b ${quotedBranch} ${quotedRemoteBranch} || git checkout -f --no-track -b ${quotedBranch} "$start" || exit 1`,
        "fi",
        pinUpstream,
      ].join("\n"),
      30,
    );
  });
}

/** Checks out a base branch, preferring remote refs but falling back to local snapshot refs. */
export async function checkoutFetchedBaseBranch(
  sandbox: SandboxHandle,
  baseBranch: string,
  timeoutSeconds = 30,
): Promise<void> {
  const details = `base=${baseBranch}`;
  await runLoggedGitStep("checkoutFetchedBaseBranch", details, async () => {
    const quotedBranch = quote([baseBranch]);
    const { ref: baseTarget, source } = await resolveBaseTarget(
      sandbox,
      baseBranch,
    );
    const quotedBase = quote([baseTarget]);
    const workspaceDir = workspaceDirShell();
    logGit(`checkoutFetchedBaseBranch: using base source=${source}`);
    if (source === "remote") {
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && (git checkout ${quotedBranch} || git checkout -b ${quotedBranch} ${quotedBase}) && git merge --ff-only ${quotedBase}`,
        timeoutSeconds,
      );
      return;
    }
    if (source === "local") {
      await execSdkGitOperation(
        sandbox,
        `checkoutBranch ${baseBranch}`,
        () => sandbox.git.checkoutBranch(WORKSPACE_DIR, baseBranch),
        timeoutSeconds,
      );
      return;
    }
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git checkout -B ${quotedBranch} ${quotedBase}`,
      timeoutSeconds,
    );
  });
}

/**
 * Resets tracked files from a snapshot worktree.
 *
 * Seeded runtime snapshots carry /tmp/.startup-commands-done and may also carry
 * untracked local-service state used to restore stopped databases. In that case
 * preserve untracked files; deleting them makes the sandbox skip seeding while
 * starting from an empty DB.
 */
export async function normalizeSnapshotWorktree(
  sandbox: SandboxHandle,
): Promise<void> {
  const workspaceDir = workspaceDirShell();
  await runLoggedGitStep(
    "normalizeSnapshotWorktree",
    WORKSPACE_DIR,
    async () => {
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && git reset --hard HEAD && if [ -f /tmp/.startup-commands-done ]; then echo "seeded snapshot marker found; preserving untracked runtime state"; else git clean -fd; fi`,
        60,
      );
    },
  );
}

/** Shell for a non-interactive dependency install of `dir` with package manager `pm`. */
export function dependencyInstallCommand(pm: string, dir: string): string {
  if (pm === "pnpm") {
    return `npm install -g pnpm && cd ${dir} && pnpm install --config.confirm-modules-purge=false`;
  }
  if (pm === "yarn") {
    return `npm install -g yarn && cd ${dir} && yarn install`;
  }
  return `cd ${dir} && npm install`;
}

/** Installs project dependencies using the detected package manager. */
export async function installDependencies(
  sandbox: SandboxHandle,
  pm: string,
  dir: string = WORKSPACE_DIR,
): Promise<void> {
  const timeoutSeconds =
    pm === "pnpm"
      ? PNPM_INSTALL_TIMEOUT_SECONDS
      : pm === "yarn"
        ? YARN_INSTALL_TIMEOUT_SECONDS
        : NPM_INSTALL_TIMEOUT_SECONDS;
  await execHandle(sandbox, dependencyInstallCommand(pm, dir), timeoutSeconds);
}

/** Best-effort pip for `dir`'s requirements.txt / pyproject.toml (never throws). */
export async function installPythonDependencies(
  sandbox: SandboxHandle,
  dir: string = WORKSPACE_DIR,
): Promise<void> {
  const result = await installPythonDependenciesBestEffort(sandbox, dir);
  if (!result.attempted) return;
  if (result.ok) {
    logGit("installPythonDependencies: pip install succeeded");
    return;
  }
  logGit(
    "installPythonDependencies: pip install failed (continuing without Python deps)",
  );
}

/**
 * Clones a GitHub repo into `destDir` with retry on transient network errors.
 * SDK clone doesn't clean the target dir, so this pre-cleans it first.
 *
 * Extracted from `cloneAndSetupRepo` so a linked repo's clone (into
 * `/tmp/workspace/<name>`, not `WORKSPACE_DIR`) shares the same retry loop
 * instead of copying it — see `linkedRepos.ts`'s `prepareLinkedRepo`. Does
 * NOT install the git credential helper; callers that need it (both current
 * ones do) install it themselves before or after, per their own ordering
 * needs.
 */
export async function cloneRepoInto(
  sandbox: SandboxHandle,
  installationId: number,
  owner: string,
  name: string,
  destDir: string,
  onProgress?: (label: string) => Promise<void>,
  gitAccess: SandboxGitAccess = SANDBOX_GIT_WRITE,
): Promise<void> {
  if (onProgress) await onProgress("Cloning repository...");
  const { token: githubToken } = await mintSandboxGitToken(
    installationId,
    gitAccess,
  );
  const repoUrl = `https://github.com/${owner}/${name}.git`;

  await execHandle(sandbox, `rm -rf ${quote([destDir])}`, 30);

  await retryGitNetworkOperation(
    "cloneRepoInto",
    `${owner}/${name}`,
    () =>
      execSdkGitOperation(
        sandbox,
        `clone ${owner}/${name}`,
        () =>
          sandbox.git.clone(repoUrl, destDir, "x-access-token", githubToken),
        REPO_CLONE_TIMEOUT_SECONDS,
      ),
    { delayStepMs: 2000 },
  );
}

/**
 * Clones a GitHub repo into the sandbox and optionally installs dependencies.
 *
 * The eva git credential helper is installed before the clone so the SDK
 * call can use a bare HTTPS URL — no token in the URL, no token in process
 * args.
 */
export async function cloneAndSetupRepo(
  ctx: ActionCtx,
  sandbox: SandboxHandle,
  installationId: number,
  owner: string,
  name: string,
  shouldInstallDeps: boolean,
  onProgress?: (label: string) => Promise<void>,
  gitAccess: SandboxGitAccess = SANDBOX_GIT_WRITE,
): Promise<void> {
  const details = `${owner}/${name}, installDeps=${shouldInstallDeps}`;
  await runLoggedGitStep("cloneAndSetupRepo", details, async () => {
    await execHandle(sandbox, `rm -rf ${quote([LEGACY_WORKSPACE_DIR])}`, 30);
    await cloneRepoInto(
      sandbox,
      installationId,
      owner,
      name,
      WORKSPACE_DIR,
      onProgress,
      gitAccess,
    );

    await ensureGitCredentialHelper(ctx, sandbox, installationId, {
      owner,
      name,
    });

    if (!shouldInstallDeps) {
      return;
    }
    if (onProgress) await onProgress("Installing dependencies...");
    const pm = await detectPackageManager(sandbox);
    logGit(
      `installDependencies: detected package manager "${pm}" for ${owner}/${name}`,
    );
    await installDependencies(sandbox, pm);
    await installPythonDependencies(sandbox);
  });
}

/** Sets up a working branch from the best available local ref with no pre-merge git choreography. */
export async function setupBranch(
  sandbox: SandboxHandle,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const details = `branch=${branchName}, base=${baseBranch}`;
  await runLoggedGitStep("setupBranch", details, async () => {
    const { ref: startTarget, source } = await resolveBranchStartTarget(
      sandbox,
      branchName,
      baseBranch,
    );
    logGit(
      `setupBranch: using start source=${source} ref=${startTarget} for branch=${branchName}`,
    );
    const quotedBranch = quote([branchName]);
    const quotedStartTarget = quote([startTarget]);
    const workspaceDir = workspaceDirShell();
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git checkout --no-track -B ${quotedBranch} ${quotedStartTarget}`,
      15,
    );
    await pinBranchUpstream(sandbox, branchName);
  });
}

type BranchPublishSync = {
  remoteExists: boolean;
  replaceRemoteTip?: string;
};

async function localBranchReflogShas(
  sandbox: SandboxHandle,
  branchName: string,
  workspaceDirOverride?: string,
): Promise<string[]> {
  const workspaceDir = workspaceDirOverride ?? workspaceDirShell();
  const quotedLocalRef = quote([`refs/heads/${branchName}`]);
  try {
    return parseGitNameOnlyList(
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && git reflog show --format=%H ${quotedLocalRef}`,
        15,
      ),
    );
  } catch (error) {
    logGit(
      `localBranchReflogShas: no reflog for ${branchName}: ${errorMessage(error)}`,
    );
    return [];
  }
}

async function synchronizeBranchForPublish(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  branchName: string,
  workspaceDirOverride?: string,
): Promise<BranchPublishSync> {
  if (!isSafeBranchName(branchName)) {
    throw new Error(`Unsafe branch name: ${branchName}`);
  }

  const workspaceDir = workspaceDirOverride ?? workspaceDirShell();
  const currentBranch = (
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git branch --show-current`,
      10,
    )
  ).trim();
  if (currentBranch !== branchName) {
    const quotedLocalHeadRef = quote([`refs/heads/${branchName}`]);
    const localBranchState = (
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && ((git show-ref --verify --quiet ${quotedLocalHeadRef} && echo exists) || echo missing)`,
        10,
      )
    ).trim();
    if (currentBranch === "" || localBranchState !== "missing") {
      throw new Error(
        `Refusing to publish ${branchName}: sandbox is on ${currentBranch || "detached HEAD"}`,
      );
    }
    logGit(
      `synchronizeBranchForPublish: sandbox stranded on ${currentBranch} with no local ${branchName}; creating it at HEAD`,
    );
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git switch -c ${quote([branchName])}`,
      15,
    );
    await pinBranchUpstream(sandbox, branchName);
  }

  const fetched = await fetchBranchRefs(sandbox, owner, name, [branchName], {
    prune: false,
    timeoutSeconds: 60,
    retryAttempts: 2,
    workspaceDir,
  });
  const remoteRefName = `refs/remotes/origin/${branchName}`;
  const quotedRemoteRef = quote([remoteRefName]);
  const quotedLocalRef = quote([`refs/heads/${branchName}`]);
  if (!fetched.includes(branchName)) {
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git update-ref -d ${quotedRemoteRef}`,
      10,
    );
    return { remoteExists: false };
  }

  const divergence = (
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git rev-list --left-right --count ${quotedRemoteRef}...${quotedLocalRef}`,
      15,
    )
  ).trim();
  if (/^0\s+\d+$/.test(divergence)) {
    return { remoteExists: true };
  }
  if (/^[1-9]\d*\s+0$/.test(divergence)) {
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git merge --ff-only ${quotedRemoteRef}`,
      30,
    );
    return { remoteExists: true };
  }
  if (/^[1-9]\d*\s+[1-9]\d*$/.test(divergence)) {
    const [remoteOnlyCommits, localOnlyCommits] = divergence.split(/\s+/);
    const remoteTip = (
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && git rev-parse --verify ${quotedRemoteRef}`,
        10,
      )
    ).trim();
    const reflogShas = await localBranchReflogShas(
      sandbox,
      branchName,
      workspaceDir,
    );
    if (rewrittenBranchIsOwnHistory(remoteTip, reflogShas)) {
      if (!isEvaOwnedBranch(branchName)) {
        throw new Error(rewrittenBranchPublishError(branchName));
      }
      logGit(
        `synchronizeBranchForPublish: origin/${branchName} tip ${remoteTip.slice(0, 7)} is in the local branch reflog (${reflogShas.length} entries); the local branch rewrote its own history — publishing leased on that tip (${remoteOnlyCommits} remote-only commits vs ${localOnlyCommits} local)`,
      );
      return { remoteExists: true, replaceRemoteTip: remoteTip };
    }
    logGit(
      `synchronizeBranchForPublish: origin/${branchName} tip ${remoteTip.slice(0, 7)} is not in the local branch reflog (${reflogShas.length} entries); merging its ${remoteOnlyCommits} remote-only commits into the ${localOnlyCommits} local`,
    );
    try {
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && git merge --no-edit ${quotedRemoteRef}`,
        120,
      );
    } catch (error) {
      logGit(
        `synchronizeBranchForPublish: merge origin/${branchName} failed: ${errorMessage(error)}`,
      );
      try {
        await execGitCommand(
          sandbox,
          `cd ${workspaceDir} && git merge --abort`,
          30,
        );
      } catch (abortError) {
        logGit(
          `synchronizeBranchForPublish: merge --abort failed: ${errorMessage(abortError)}`,
        );
      }
      throw new Error(
        `Could not merge origin/${branchName} (${remoteOnlyCommits} commits this sandbox never had) into the local branch (${localOnlyCommits} unpublished commits). The sandbox was left clean — there are no conflict markers to resolve. If you rewrote history, force-push; if both sides committed, merge the remote branch in the sandbox and retry.`,
      );
    }
    return { remoteExists: true };
  }
  throw new Error(
    `Could not classify branch divergence for ${branchName}: ${divergence}`,
  );
}

async function isAutoPublishPinned(
  sandbox: SandboxHandle,
  workspaceDir: string,
  chatBranch: string,
): Promise<boolean> {
  try {
    const pinned = (
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && (git config --get ${quote([AUTO_PUBLISH_BRANCH_GIT_CONFIG])} || true)`,
        10,
      )
    ).trim();
    return pinned === chatBranch;
  } catch {
    return false;
  }
}

/**
 * Pushes the current branch to origin with retry logic.
 *
 * Auth comes from the eva git credential helper installed at sandbox
 * bootstrap; the remote URL no longer carries a token.
 */
export async function pushBranchToOrigin(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  branchName: string,
  opts?: {
    timeoutSeconds?: number;
    retryAttempts?: number;
    /** Absolute clone path to push from. Defaults to the primary `/tmp/repo`. */
    workspaceDir?: string;
  },
): Promise<{ pushed: boolean; published: boolean }> {
  const details = `${owner}/${name}, branch=${branchName}`;
  return await runLoggedGitStep("pushBranchToOrigin", details, async () => {
    const workspaceDir = opts?.workspaceDir ?? workspaceDirShell();
    const currentBranch = (
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && git branch --show-current`,
        10,
      )
    ).trim();
    if (isChatSideBranch(currentBranch, branchName)) {
      if (await isAutoPublishPinned(sandbox, workspaceDir, branchName)) {
        // The sender's `manualSideBranchPublish` flag: the agent owns its side
        // branches, and the chip's "Commit & push" publishes them on request.
        logGit(
          `pushBranchToOrigin: sandbox is on side branch ${currentBranch}; left unpublished by the branch policy (${details})`,
        );
        return { pushed: false, published: false };
      }
      logGit(
        `pushBranchToOrigin: sandbox is on side branch ${currentBranch}; publishing it instead (${details})`,
      );
      await publishCheckedOutBranch(sandbox, owner, name, currentBranch, {
        ...opts,
        workspaceDir,
      });
      return { pushed: false, published: false };
    }
    return await publishCheckedOutBranch(sandbox, owner, name, branchName, {
      ...opts,
      workspaceDir,
    });
  });
}

/**
 * Pins turn-end auto-publish to `pinnedBranch`, or unpins it (null). Read by
 * the callback's `persistTurnWork` and by `pushBranchToOrigin`, so both
 * publish paths follow one per-turn setting.
 */
export async function writeAutoPublishPolicy(
  sandbox: SandboxHandle,
  pinnedBranch: string | null,
): Promise<void> {
  const key = quote([AUTO_PUBLISH_BRANCH_GIT_CONFIG]);
  const command =
    pinnedBranch === null
      ? `git config --unset ${key} || true`
      : `git config ${key} ${quote([pinnedBranch])}`;
  await execGitCommand(sandbox, `cd ${workspaceDirShell()} && ${command}`, 10);
}

/**
 * Commits any uncommitted work on the checked-out branch and pushes it. The
 * user asked for it ("Commit & push" on the branch chip), so a side branch is
 * published too, whatever the auto-publish policy says. Eva-owned branches
 * only: this never pushes main or a base branch.
 */
export async function commitAndPushCheckedOutBranch(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
): Promise<{
  branch: string;
  sync: { uncommittedFiles: number; unpushedCommits: number };
}> {
  const workspaceDir = workspaceDirShell();
  const branch = (
    await execGitCommand(sandbox, `cd ${workspaceDir} && git branch --show-current`, 10)
  ).trim();
  if (!isEvaOwnedBranch(branch)) {
    throw new Error(
      branch === ""
        ? "The sandbox is on a detached HEAD. Check out a branch first."
        : `Eva only pushes eva/ branches. The sandbox is on ${branch}.`,
    );
  }
  const pathspecs = quote(["--", ".", ...COMMIT_EXCLUDE_PATHSPECS]);
  await execGitCommand(
    sandbox,
    `cd ${workspaceDir} && git add -A ${pathspecs} && (git diff --cached --quiet || git commit -q -m ${quote(["task: commit work from the sandbox"])})`,
    30,
  );
  await pushBranchToOrigin(sandbox, owner, name, branch, {
    timeoutSeconds: 90,
    retryAttempts: 3,
  });
  const [uncommitted = "", unpushed = ""] = (
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && echo "$(git status --porcelain ${pathspecs} | wc -l)|$(git rev-list --count HEAD --not --remotes=origin)"`,
      15,
    )
  )
    .trim()
    .split("|");
  return {
    branch,
    sync: {
      uncommittedFiles: Number(uncommitted) || 0,
      unpushedCommits: Number(unpushed) || 0,
    },
  };
}

async function publishCheckedOutBranch(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  branchName: string,
  opts: {
    timeoutSeconds?: number;
    retryAttempts?: number;
    workspaceDir: string;
  },
): Promise<{ pushed: boolean; published: boolean }> {
  const details = `${owner}/${name}, branch=${branchName}`;
  const workspaceDir = opts.workspaceDir;
  const quotedRefspec = quote([
    `refs/heads/${branchName}:refs/heads/${branchName}`,
  ]);
  const repoUrl = bareGitHubRepoUrl(owner, name);
  const maxAttempts = opts.retryAttempts ?? 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { remoteExists, replaceRemoteTip } =
      await synchronizeBranchForPublish(
        sandbox,
        owner,
        name,
        branchName,
        workspaceDir,
      );
    const lease =
      replaceRemoteTip === undefined
        ? ""
        : `--force-with-lease=${quote([`refs/heads/${branchName}:${replaceRemoteTip}`])} `;

    let unpushedCount: string | undefined;
    try {
      const exclusion = remoteExists
        ? quote([`refs/remotes/origin/${branchName}`])
        : "--remotes=origin";
      unpushedCount = (
        await execGitCommand(
          sandbox,
          `cd ${workspaceDir} && git rev-list --count HEAD --not ${exclusion}`,
          15,
        )
      ).trim();
    } catch (error) {
      logGit(
        `pushBranchToOrigin: ahead-of-remote gate failed, pushing anyway (${details}): ${errorMessage(error)}`,
      );
    }
    if (unpushedCount === "0") {
      logGit(
        `pushBranchToOrigin: skipped — HEAD has no commits origin lacks (${details})`,
      );
      return { pushed: false, published: remoteExists };
    }

    try {
      await execGitCommand(
        sandbox,
        `${gitRemoteAuthPrefix(workspaceDir, repoUrl)} git push ${lease}-u origin ${quotedRefspec}`,
        opts.timeoutSeconds ?? 60,
      );
      return { pushed: true, published: true };
    } catch (error) {
      const message = errorMessage(error);
      const shouldRetry =
        attempt < maxAttempts &&
        (isRetryableGitNetworkError(message) ||
          isNonFastForwardPushError(message));
      if (!shouldRetry) {
        throw error;
      }
      const delayMs = 1000 * attempt;
      logGit(
        `pushBranchToOrigin: remote moved or push was transient; refetching in ${delayMs}ms after attempt ${attempt}/${maxAttempts} (${details}): ${message}`,
      );
      await sleep(delayMs);
    }
  }
  throw new Error(`pushBranchToOrigin exhausted retries (${details})`);
}

/**
 * Replaces origin/<branch> with the sandbox's local branch — the user-confirmed
 * recovery after synchronizeBranchForPublish refuses a rewritten local branch.
 *
 * `--force-with-lease` is pinned to the remote-tracking ref refreshed by the
 * fetch below, so a push that landed between fetch and push aborts instead of
 * being silently discarded. When the fetch reports the remote branch deleted,
 * a plain push recreates it and no lease is needed.
 */
export async function forcePushBranchToOrigin(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  branchName: string,
  opts?: {
    /** Absolute clone path to push from. Defaults to the primary `/tmp/repo`. */
    workspaceDir?: string;
  },
): Promise<void> {
  if (!isSafeBranchName(branchName)) {
    throw new Error(`Unsafe branch name: ${branchName}`);
  }
  const details = `${owner}/${name}, branch=${branchName}`;
  await runLoggedGitStep("forcePushBranchToOrigin", details, async () => {
    const workspaceDir = opts?.workspaceDir ?? workspaceDirShell();
    const quotedLocalRef = quote([`refs/heads/${branchName}`]);
    const localBranchState = (
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && ((git show-ref --verify --quiet ${quotedLocalRef} && echo exists) || echo missing)`,
        10,
      )
    ).trim();
    if (localBranchState !== "exists") {
      throw new Error(
        `Cannot force-push ${branchName}: the branch does not exist in the sandbox`,
      );
    }
    const fetched = await fetchBranchRefs(sandbox, owner, name, [branchName], {
      prune: false,
      timeoutSeconds: 60,
      retryAttempts: 2,
      workspaceDir,
    });
    const lease = fetched.includes(branchName)
      ? `--force-with-lease=${quote([`refs/heads/${branchName}`])} `
      : "";
    const quotedRefspec = quote([
      `refs/heads/${branchName}:refs/heads/${branchName}`,
    ]);
    const repoUrl = bareGitHubRepoUrl(owner, name);
    await execGitCommand(
      sandbox,
      `${gitRemoteAuthPrefix(workspaceDir, repoUrl)} git push ${lease}-u origin ${quotedRefspec}`,
      90,
    );
  });
}

function isSnapshotUnusableError(err: unknown): boolean {
  const msg = errorMessage(err);
  const requestedASnapshot =
    msg.includes("vercel create failed (snapshot=") &&
    !msg.includes("vercel create failed (snapshot=none");
  if (!requestedASnapshot) return false;

  const lower = msg.toLowerCase();
  return (
    lower.includes("not_found") ||
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("snapshot_not_found") ||
    lower.includes("invalid_snapshot")
  );
}

type PreparedSandbox = {
  sandbox: SandboxHandle;
  usedSnapshot: boolean;
  dockerReady: Promise<boolean>;
};

/** Creates a sandbox and prepares the repo by cloning or syncing from a snapshot. */
export async function createSandboxAndPrepareRepo(
  ctx: ActionCtx,
  client: SandboxClient,
  installationId: number,
  owner: string,
  name: string,
  sandboxEnvVars: Record<string, string>,
  lifecycle: SandboxLifecycle,
  snapshotName?: string,
  onSandboxAcquired?: (sandbox: SandboxHandle) => Promise<void>,
  onProgress?: (label: string) => Promise<void>,
  syncStrategy: RepoSyncStrategy = { mode: "all" },
  // Override the SDK create-ready wait. Large seeded snapshots (~10GB) take
  // well over the 30s default to start, so callers that boot from them (seeded
  // snapshot builds) pass a longer value to avoid spurious create timeouts +
  // the orphaned sandboxes they leave server-side.
  readyTimeoutSeconds?: number,
  // When true, skip `pnpm/yarn install` during a fresh clone. Used by
  // createSeedPrepSandbox: the launchSeedRun buildCommands run pnpm install
  // inside the detached seed script, so installing here wastes 10–15 minutes
  // and reliably trips Convex's 600s per-action ceiling on providers (Vercel)
  // that don't have it pre-baked into their base snapshot.
  skipInstallDeps = false,
  // "Fork session": fork this sandbox instead of booting `snapshotName`. The
  // fork carries the repo checkout, so it takes the snapshot path below. No
  // fallback on failure — the source's data is the point of a fork.
  forkFrom?: string,
  // Shared package-cache Drive role. See createSandbox.driveCacheRole.
  driveCacheRole: DriveCacheRole = DRIVE_CACHE_READER,
  // When true, return without waiting for dockerd; the caller must await
  // `dockerReady` before anything that needs Docker. Docker takes 2.8s at p50
  // and 14.6s at p90, which a new session's repo prep should not wait on.
  deferDocker = false,
  /** vCPUs for the new sandbox; omit for the provider default. */
  vcpus?: number,
  /** The GitHub access of every token this sandbox gets at create and clone. */
  gitAccess: SandboxGitAccess = SANDBOX_GIT_WRITE,
): Promise<PreparedSandbox> {
  let sandbox: SandboxHandle | undefined;
  try {
    const details = `${owner}/${name}, forkFrom=${forkFrom ?? "none"}, snapshot=${snapshotName ?? "none"}, syncStrategy=${syncStrategy.mode}`;
    return await runLoggedGitStep(
      "createSandboxAndPrepareRepo",
      details,
      async () => {
        if (onProgress) await onProgress("Creating sandbox...");
        let effectiveSnapshot = snapshotName;
        try {
          sandbox = await createSandbox(
            client,
            installationId,
            sandboxEnvVars,
            lifecycle,
            effectiveSnapshot,
            readyTimeoutSeconds,
            onSandboxAcquired,
            forkFrom,
            driveCacheRole,
            vcpus,
            gitAccess,
          );
        } catch (err) {
          if (!forkFrom && effectiveSnapshot && isSnapshotUnusableError(err)) {
            logGit(
              `createSandboxAndPrepareRepo: snapshot ${effectiveSnapshot} is in error state — falling back to default snapshot + git clone (${errorMessage(err)})`,
            );
            if (onProgress)
              await onProgress("Snapshot unavailable — cloning instead...");
            effectiveSnapshot = undefined;
            sandbox = await createSandbox(
              client,
              installationId,
              sandboxEnvVars,
              lifecycle,
              undefined,
              readyTimeoutSeconds,
              onSandboxAcquired,
              undefined, // forkFrom — the fallback is a fresh boot
              driveCacheRole,
              vcpus,
              gitAccess,
            );
          } else {
            throw err;
          }
        }
        // After createSandbox, not inside it: a missing docker binary installs
        // through the package manager, which must not race createSandbox's jq
        // install. Idempotent and serialized by a flock, so a later
        // ensureDockerDaemon simply waits for this one. Never throws.
        const createdSandbox = sandbox;
        const dockerReady = runLoggedGitStep(
          "createSandbox.bootstrapDocker",
          createdSandbox.id,
          () => bootstrapVercelDocker(createdSandbox),
        );
        if (!deferDocker) await dockerReady;
        if (effectiveSnapshot || forkFrom) {
          // Deliberately no `installDependencies`/pnpm install on this path:
          // a seeded/base snapshot already carries node_modules from the seed
          // build (launchSeedRun's buildCommands), and normalizeSnapshotWorktree
          // preserves untracked files (skips `git clean -fd`) whenever the
          // seed marker is present, so node_modules survives the reset below.
          // Re-installing here would cost minutes on every session create.
          await normalizeSnapshotWorktree(sandbox);
          // The snapshot was baked with a stale token in its git config /
          // remotes. Install the credential helper before any git network op
          // so syncRepo (and later in-sandbox `git pull`) authenticate cleanly.
          await ensureGitCredentialHelper(ctx, sandbox, installationId, {
            owner,
            name,
          });
          if (syncStrategy.mode !== "none") {
            if (onProgress) await onProgress("Syncing repository...");
            await syncRepo(sandbox, owner, name, syncStrategy);
          }
          return { sandbox, usedSnapshot: true, dockerReady };
        }
        if (lifecycle.ephemeral && syncStrategy.mode === "none") {
          await cloneAndSetupRepo(
            ctx,
            sandbox,
            installationId,
            owner,
            name,
            false,
            onProgress,
            gitAccess,
          );
          return { sandbox, usedSnapshot: false, dockerReady };
        }
        await cloneAndSetupRepo(
          ctx,
          sandbox,
          installationId,
          owner,
          name,
          !lifecycle.ephemeral && !skipInstallDeps,
          onProgress,
          gitAccess,
        );
        if (syncStrategy.mode !== "none") {
          if (onProgress) await onProgress("Syncing repository...");
          await syncRepo(sandbox, owner, name, syncStrategy);
        }
        return { sandbox, usedSnapshot: false, dockerReady };
      },
    );
  } catch (error) {
    if (sandbox) {
      await deleteSandboxAndCredentials(ctx, sandbox);
    }
    throw error;
  }
}

/** Resumes an existing sandbox or creates a new one with repo setup. */
export async function getOrCreateSandbox(
  ctx: ActionCtx,
  client: SandboxClient,
  existingSandboxId: string | undefined,
  installationId: number,
  owner: string,
  name: string,
  sandboxEnvVars: Record<string, string>,
  lifecycle: SandboxLifecycle,
  snapshotName?: string,
  onProgress?: (label: string) => Promise<void>,
  syncStrategy: RepoSyncStrategy = { mode: "all" },
): Promise<{
  sandbox: SandboxHandle;
  isNew: boolean;
  resumeFellBack: boolean;
}> {
  const details = `${owner}/${name}, existingSandboxId=${existingSandboxId ?? "none"}, snapshot=${snapshotName ?? "none"}, syncStrategy=${syncStrategy.mode}`;
  return await runLoggedGitStep("getOrCreateSandbox", details, async () => {
    if (existingSandboxId) {
      const resumed = await tryResumeSandbox(
        ctx,
        client,
        existingSandboxId,
        installationId,
        owner,
        name,
        syncStrategy,
        onProgress,
      );
      if (resumed) {
        return { sandbox: resumed, isNew: false, resumeFellBack: false };
      }
      if (onProgress) {
        await onProgress("Previous sandbox expired — creating a fresh one...");
      }
    }
    const { sandbox } = await createSandboxAndPrepareRepo(
      ctx,
      client,
      installationId,
      owner,
      name,
      sandboxEnvVars,
      lifecycle,
      snapshotName,
      undefined,
      onProgress,
      syncStrategy,
    );
    return {
      sandbox,
      isNew: true,
      resumeFellBack: existingSandboxId !== undefined,
    };
  });
}

/**
 * Does this error mean the sandbox is genuinely gone (deleted, archived,
 * expired) — i.e. safe to fall through to creating a new one?
 *
 * Takes the error object, not its message: classification reads the provider's
 * structured signals (HTTP status, error type) and only falls back to text for
 * a tagged provider error. See `sandboxErrors.ts`. An earlier version swallowed
 * every error and silently created a new sandbox, which orphaned the old one in
 * common races (e.g. user clicking Start while a stop is mid-flight — the
 * sandbox is in a transitional state, `start()` rejects, and we'd happily
 * burn a fresh sandbox + lose the old one's dev server / terminal state).
 */
function isSandboxMissingError(err: unknown): boolean {
  return isSandboxGoneError(err);
}

/**
 * Attempts to resume an existing sandbox. Returns the sandbox on success,
 * `null` if the sandbox is genuinely gone (caller should create a new one),
 * or throws on persistent transient errors.
 *
 * Retries with backoff to ride through transitional sandbox states (e.g.
 * sandbox is mid-stop when Start is clicked). Only "missing" / unresumable
 * errors short-circuit to a new sandbox; everything else surfaces, so we
 * never silently abandon a recoverable sandbox.
 */
async function tryResumeSandbox(
  ctx: ActionCtx,
  client: SandboxClient,
  existingSandboxId: string,
  installationId: number,
  owner: string,
  name: string,
  syncStrategy: RepoSyncStrategy,
  onProgress?: (label: string) => Promise<void>,
): Promise<SandboxHandle | null> {
  const maxAttempts = 4;
  const backoffMs = [2000, 4000, 8000];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (onProgress) await onProgress("Resuming sandbox...");
      const sandbox = await client.get(existingSandboxId);
      try {
        await sandbox.refresh();
      } catch (refreshErr) {
        if (isSandboxMissingError(refreshErr)) {
          logGit(
            `getOrCreateSandbox: resume refresh says gone — will create new one (${errorMessage(refreshErr)})`,
          );
          return null;
        }
        throw refreshErr;
      }
      if (sandbox.state === "gone" || sandbox.state === "error") {
        logGit(
          `getOrCreateSandbox: resume state=${sandbox.state} — will create new one`,
        );
        return null;
      }
      await ensureSandboxRunning(sandbox, {
        timeoutSeconds: RESUME_READY_TIMEOUT_SECONDS,
        // Explicit user start (Start clicked / new run on a reused sandbox):
        // wait out a stop still snapshotting and resume, instead of refusing.
        resumeAfterStop: true,
        onRestoring: onProgress
          ? () => onProgress("Resuming sandbox...")
          : undefined,
      });
      // Self-heal: rotate the per-sandbox secret and (re)install the helper on
      // every resume so the in-sandbox `git pull` works without a stale token
      // and so sandboxes that pre-date this change pick up the helper.
      await ensureGitCredentialHelper(ctx, sandbox, installationId, {
        owner,
        name,
      });
      if (syncStrategy.mode !== "none") {
        if (onProgress) await onProgress("Syncing repository...");
        await syncRepo(sandbox, owner, name, syncStrategy);
      }
      return sandbox;
    } catch (err) {
      if (isSandboxMissingError(err)) {
        logGit(
          `getOrCreateSandbox: resume failed because sandbox is gone — will create new one (${errorMessage(err)})`,
        );
        // Unresumable (missing snap / deadline): do not burn another 180s retry.
        return null;
      }
      if (attempt === maxAttempts) throw err;
      const delay = backoffMs[attempt - 1] ?? 8000;
      logGit(
        `getOrCreateSandbox: resume attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms — ${errorMessage(err)}`,
      );
      await sleep(delay);
    }
  }
  return null;
}
