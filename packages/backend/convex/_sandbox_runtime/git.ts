"use node";

import type { GenericActionCtx } from "convex/server";
import { Effect } from "effect";
import { quote } from "shell-quote";
import { formatDurationMsShort } from "@eva/shared/duration";
import {
  retryAfterDelays,
  retryLinearBackoff,
  runPromiseRethrowing,
} from "../_effect/retry";
import { getInstallationToken } from "../githubAuth";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { SandboxClient, SandboxHandle } from "../_sandbox/provider";
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
import { ensureGitCredentialHelper } from "./gitCredentials";
import {
  classifyGitFailure,
  type GitFailure,
  isSandboxExecTimeout,
} from "../_git/gitErrors";
import { gitRemoteAuthPrefix } from "./gitRemoteCommand";
import {
  isEvaOwnedBranch,
  parseGitNameOnlyList,
  rewrittenBranchIsOwnHistory,
  rewrittenBranchPublishError,
} from "./divergedPublish";
import { ensureSwapFile } from "./swap";
import {
  EVA_ENV_FILE,
  ensureEvaEnvInteractiveHookScript,
  renderEvaEnvFile,
  VERCEL_DEFAULT_EXPOSED_PORTS,
} from "../_sandbox/vercelProvider";
import { buildSandboxLabels } from "../_sandbox/tags";

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

/** Logs a git-related message with a consistent prefix. */
function logGit(message: string): void {
  console.log(`[sandbox][git] ${message}`);
}

/** Kills stale git processes and removes lock files after a timeout. */
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
      `cleanupTimedOutGitState: cleanup failed (best-effort): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Strips GitHub tokens from command strings for safe logging.
 * Matches all GitHub token prefixes (ghs_, ghp_, gho_, ghu_) regardless of URL escaping.
 */
function sanitizeCommand(command: string): string {
  return command.replace(/gh[spou]_[A-Za-z0-9_]+/g, "***");
}

/** Executes a git command, cleaning up lock files on timeout errors. */
async function execGitCommand(
  sandbox: SandboxHandle,
  command: string,
  timeoutSeconds: number,
): Promise<string> {
  const sanitized = sanitizeCommand(command);
  const startedAt = Date.now();
  logGit(`exec [timeout=${timeoutSeconds}s]: ${sanitized}`);
  try {
    const result = await execHandle(sandbox, command, timeoutSeconds);
    logGit(
      `exec completed in ${formatDurationMsShort(Date.now() - startedAt)}: ${sanitized}`,
    );
    return result;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    logGit(
      `exec failed after ${formatDurationMsShort(elapsed)} [timeout=${timeoutSeconds}s]: ${sanitized} — ${message}`,
    );
    if (isSandboxExecTimeout(message)) {
      await cleanupTimedOutGitState(sandbox);
    }
    throw error;
  }
}

const SDK_TIMEOUT_BUFFER_MS = 15_000;

/** Wraps a sandbox git call with timeout, logging, and stale-process cleanup. */
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
    const message = error instanceof Error ? error.message : String(error);
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
async function runLoggedGitStep<T>(
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
      `${label} failed after ${formatDurationMsShort(Date.now() - startedAt)}${details ? ` (${details})` : ""}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/** Deduplicates and trims branch names, removing empty entries. */
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

/** Git refuses whitespace in ref names; anything else is unsafe to inject. */
function isSafeBranchName(branchName: string): boolean {
  return /^[^\s\\:?*[~^]+$/.test(branchName) && !branchName.includes("..");
}

/** Retries transient git network operations with short backoff. */
async function retryGitNetworkOperation<T>(
  label: string,
  details: string,
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let attempt = 0;
  const runOnce = Effect.suspend(() => {
    attempt += 1;
    return Effect.tryPromise({ try: fn, catch: classifyGitFailure });
  });

  return await runPromiseRethrowing(
    runOnce.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (attempt > 1) {
            logGit(
              `${label} recovered on retry ${attempt}/${maxAttempts}${details ? ` (${details})` : ""}`,
            );
          }
        }),
      ),
      Effect.tapError((failure) =>
        Effect.sync(() => {
          if (attempt >= maxAttempts || failure._tag !== "GitNetworkError") {
            return;
          }
          const delayMs = 1000 * attempt;
          logGit(
            `${label} retrying in ${delayMs}ms after attempt ${attempt}/${maxAttempts}${details ? ` (${details})` : ""}: ${failure.message}`,
          );
        }),
      ),
      Effect.retry({
        schedule: retryLinearBackoff(maxAttempts, 1000),
        while: (failure) => failure._tag === "GitNetworkError",
      }),
      // Callers catch and ask `instanceof SandboxCommandFailedError`, so the
      // edge rethrows the error the git command actually threw.
      Effect.mapError((failure) => failure.cause),
    ),
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
  // Fired as soon as Sandbox.create returns — before jq/git/docker setup.
  // Those post-create steps absorb Vercel's first-command boot penalty
  // (seconds–tens of seconds); session UI should not wait on them.
  onSandboxAcquired?: (sandbox: SandboxHandle) => Promise<void>,
  // Boot from a Vercel Container Registry image instead of the legacy runtime.
  // Only read when there is no snapshot — a restore carries its own image.
  image?: string,
  /**
   * Manager Ave never runs repo services, so installing and polling dockerd
   * on the Ubuntu universal image is pure wait (dnf is missing, then 90s+60s
   * of `docker info` loops). Skip it.
   */
  skipDocker = false,
): Promise<SandboxHandle> {
  const details = [
    `installation=${installationId}`,
    snapshotName ? `snapshot=${snapshotName}` : "snapshot=none",
    image ? `image=${image}` : "image=none",
    lifecycle.ephemeral ? "ephemeral=true" : "ephemeral=false",
  ].join(", ");
  return await runLoggedGitStep("createSandbox", details, async () => {
    const timeoutSeconds =
      readyTimeoutSeconds ??
      (snapshotName
        ? SNAPSHOT_SANDBOX_READY_TIMEOUT_SECONDS
        : DEFAULT_SANDBOX_READY_TIMEOUT_SECONDS);

    // Create does not need the GitHub token at API time (env is a
    // post-create file write). Overlap token fetch with Sandbox.create, then
    // write the env file AFTER onSandboxAcquired so the UI goes active before
    // the first-command boot penalty.
    const tokenPromise = getInstallationToken(installationId);

    const sandbox = await client.create({
      snapshot: snapshotName,
      image,
      ports: [...VERCEL_DEFAULT_EXPOSED_PORTS],
      envVars: {
        // VNC_RESOLUTION is read by the snapshot's ComputerUse plugin at startup
        // (Xvfb + x11vnc). Setting it here makes the desktop start at 1920x1080
        // natively — overriding the snapshot Dockerfile's 1280x720 default — so
        // we don't have to rely on a post-start xrandr resize.
        VNC_RESOLUTION: "1920x1080",
        ...sandboxEnvVars,
      },
      lifecycle: {
        autoStopMinutes: lifecycle.autoStopInterval,
        autoArchiveMinutes: lifecycle.autoArchiveInterval,
        autoDeleteMinutes: lifecycle.autoDeleteInterval,
        ephemeral: lifecycle.ephemeral,
        // Stamp Eva tags when ENVIRONMENT is set (Vercel dashboard/CLI filter).
        // Max 5 on Vercel — buildSandboxLabels caps + merges caller overrides.
        // Without ENVIRONMENT, labels pass through unchanged (seed-prep only).
        labels: buildSandboxLabels({
          ephemeral: lifecycle.ephemeral,
          labels: lifecycle.labels,
          repoId: sandboxEnvVars.REPO_ID,
        }),
      },
      readyTimeoutSeconds: timeoutSeconds,
    });
    logGit(
      `createSandbox: created id=${sandbox.id}, cpu=${sandbox.cpu}, memory=${sandbox.memory}, disk=${sandbox.disk}`,
    );
    // Outer callers only see the returned handle. If post-create setup throws
    // before return, their `sandbox` var stays unset and they cannot delete —
    // so orphans must be cleaned up here.
    try {
      if (onSandboxAcquired) {
        await onSandboxAcquired(sandbox);
      }
      const token = await tokenPromise;
      await runLoggedGitStep("createSandbox.writeEvaEnv", sandbox.id, () =>
        writeSandboxFile(
          sandbox,
          EVA_ENV_FILE,
          renderEvaEnvFile({
            VNC_RESOLUTION: "1920x1080",
            ...sandboxEnvVars,
            GITHUB_TOKEN: token,
            INSTALLATION_ID: String(installationId),
          }),
        ),
      );
      // Belt-and-suspenders for login shells; tmux Console already sources
      // eva-env. Never fail create over this hook.
      try {
        await runLoggedGitStep(
          "createSandbox.ensureEvaEnvInteractiveHook",
          sandbox.id,
          () =>
            execHandle(sandbox, ensureEvaEnvInteractiveHookScript(), 30, "/"),
        );
      } catch (hookError) {
        console.warn(
          `[sandbox][git] createSandbox.ensureEvaEnvInteractiveHook failed on ${sandbox.id} (continuing): ${hookError instanceof Error ? hookError.message : String(hookError)}`,
        );
      }

      const appSlug = process.env.GITHUB_APP_SLUG;
      const botUserId = process.env.GITHUB_BOT_USER_ID;
      if (!appSlug || !botUserId) {
        throw new Error(
          "GITHUB_APP_SLUG and GITHUB_BOT_USER_ID must be set in Convex env",
        );
      }
      // Fresh Vercel node24 sandboxes ship without `jq`, which the git credential
      // helper (git-credential-eva) shells out to on every authenticated
      // fetch/push. Without it, syncRepo/fetchBaseBranch fail with exit 128
      // ("jq: command not found") before the seed toolchain stage ever runs.
      // Timed individually (vs. one blanket log) so slow session creates can be
      // attributed to a specific step from Convex logs alone.
      await runLoggedGitStep("createSandbox.ensureJq", sandbox.id, () =>
        execHandle(
          sandbox,
          "command -v jq >/dev/null 2>&1 || sudo dnf install -y jq >/dev/null 2>&1 || true",
          120,
        ),
      );
      await runLoggedGitStep(
        "createSandbox.gitConfig",
        sandbox.id,
        async () => {
          await execHandle(
            sandbox,
            `git config --global user.name "${appSlug}[bot]" && git config --global user.email "${botUserId}+${appSlug}[bot]@users.noreply.github.com"`,
            10,
          );
          // Snapshot-restored /tmp/repo is owned by vercel-sandbox; session git
          // commands run as a different uid and hit "dubious ownership" without this.
          await execHandle(
            sandbox,
            "git config --global --add safe.directory '*'",
            10,
          );
          // Agents (esp. Cursor ship skills) often run `git pull` without
          // --rebase/--no-rebase; modern git fatals on divergent branches unless
          // a default is set. Rebase keeps session history linear when they do.
          await execHandle(sandbox, "git config --global pull.rebase true", 10);
        },
      );

      // Every sandbox eva creates — session, quick task, project chat or seed
      // prep — starts here, and the memory-hungry stages that follow (snapshot
      // dependency install, `next build`, the first Convex backend open) all run
      // before any resume path could provision swap. ensureSandboxRunning covers
      // later boots; this covers the first one.
      await runLoggedGitStep("createSandbox.ensureSwap", sandbox.id, () =>
        ensureSwapFile(sandbox),
      );

      // Start Docker daemon if available (for Docker-in-Docker / Supabase local
      // dev). Idempotent — also re-invoked from ensureSandboxRunning on resume
      // since dockerd doesn't survive auto-stop. Already fast-paths on an
      // already-running daemon (`docker info` check first); the timing
      // wrapper just makes that fast path visible in logs instead of assumed.
      // Orchestrator: no containers, and the universal image has no docker
      // binary — the bootstrap would sit in a 90s poll then another 60s.
      if (!skipDocker) {
        await runLoggedGitStep(
          "createSandbox.bootstrapDocker",
          sandbox.id,
          () => bootstrapVercelDocker(sandbox),
        );
      }

      return sandbox;
    } catch (error) {
      console.warn(
        `[sandbox][git] createSandbox: post-create setup failed for ${sandbox.id}; deleting orphan: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        await sandbox.delete();
      } catch (deleteError) {
        console.warn(
          `[sandbox][git] createSandbox: orphan delete failed for ${sandbox.id}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`,
        );
      }
      throw error;
    }
  });
}

/** Returns the bare HTTPS remote URL for a GitHub repo (no embedded token). */
function bareGitHubRepoUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}.git`;
}

export type FetchOriginResult = {
  /** False when a specific ref was requested and is gone on the remote. */
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
        opts?.retryAttempts,
      );
      return { fetched: true };
    } catch (error) {
      if (
        ref &&
        classifyGitFailure(error)._tag === "GitMissingRemoteRefError"
      ) {
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
    const workspaceDir = workspaceDirShell();
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
          if (classifyGitFailure(error)._tag !== "GitMissingRemoteRefError") {
            throw error;
          }
          const fetchedBranches: string[] = [];
          for (const [index, refspec] of refspecs.entries()) {
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
              if (classifyGitFailure(e)._tag !== "GitMissingRemoteRefError") {
                throw e;
              }
            }
          }
          return fetchedBranches;
        }
      },
      opts?.retryAttempts,
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

/** Checks whether the remote tracking ref origin/<branch> exists (SDK branches() only lists local). */
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

/** Resolves the best local starting ref for a working branch. */
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

/**
 * Pins the working branch's upstream to `origin/<branchName>`.
 *
 * `git checkout -B <branch> origin/<base>` tracks the START POINT, so the branch
 * was left tracking `origin/<base>` — a bare `git push` then either fataled
 * (push.default=simple, names differ) or, with push.default=upstream, aimed
 * straight at the base branch, and `git pull` silently rebased onto it.
 *
 * Written as config rather than `git branch --set-upstream-to`, which needs the
 * remote-tracking ref to exist — the remote branch is deliberately not created
 * until there is a commit to publish (see `pushBranchToOrigin`).
 *
 * Best-effort: never fails branch setup.
 */
async function pinBranchUpstream(
  sandbox: SandboxHandle,
  branchName: string,
): Promise<void> {
  if (!isSafeBranchName(branchName)) return;
  const workspaceDir = workspaceDirShell();
  try {
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git config ${quote([`branch.${branchName}.remote`])} origin && git config ${quote([`branch.${branchName}.merge`])} ${quote([`refs/heads/${branchName}`])}`,
      15,
    );
  } catch (error) {
    logGit(
      `pinBranchUpstream: failed for ${branchName} (continuing): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
        // Unmerged entries can outlive the operation marker (or the abort);
        // reset them so checkout can run again.
        `if [ -n "$(git ls-files --unmerged)" ]; then echo "resetting unmerged index entries"; git reset --merge || git reset --hard HEAD; fi`,
      ].join(" && "),
      60,
    ),
  );
}

/** Checks out a session branch, creating it from a remote or base ref if needed. */
export async function checkoutSessionBranch(
  sandbox: SandboxHandle,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const details = `branch=${branchName}, base=${baseBranch}`;
  await runLoggedGitStep("checkoutSessionBranch", details, async () => {
    // Check if branch already exists locally via SDK
    const branchList = await execSdkGitOperation(
      sandbox,
      `branches`,
      () => sandbox.git.branches(WORKSPACE_DIR),
      10,
    );
    if (branchList.branches.includes(branchName)) {
      // Branch exists locally — check if we're already on it
      const workspaceDir = workspaceDirShell();
      const currentBranch = (
        await execGitCommand(
          sandbox,
          `cd ${workspaceDir} && git branch --show-current`,
          5,
        )
      ).trim();
      if (currentBranch !== branchName) {
        // Checkout using git command (more reliable than SDK for existing branches)
        const quotedBranch = quote([branchName]);
        await execGitCommand(
          sandbox,
          `cd ${workspaceDir} && git checkout ${quotedBranch}`,
          20,
        );
      } else {
        logGit(
          `checkoutSessionBranch: already on ${branchName}, skipping checkout`,
        );
      }
      // Also self-heals branches created before the upstream pin existed.
      await pinBranchUpstream(sandbox, branchName);
      return;
    }
    // Branch doesn't exist locally — create from remote tracking or base ref.
    // `--no-track` on the base fallback: tracking the START POINT is what left
    // the branch pointing at origin/<base>; pinBranchUpstream then pins the
    // upstream to origin/<branchName> on both arms.
    // `-f` on both arms: this path only runs on a fresh sandbox with no user
    // work, but the dev server can re-dirty generated files between
    // normalizeSnapshotWorktree and here (e.g. routeTree.gen.ts), and when the
    // start point moves those files a plain checkout aborts — leaving the
    // sandbox stuck on the base branch and publish refusing at session end.
    const { ref: baseTarget } = await resolveBaseTarget(sandbox, baseBranch);
    const quotedBranch = quote([branchName]);
    const quotedRemoteBranch = quote([`origin/${branchName}`]);
    const quotedBase = quote([baseTarget]);
    const workspaceDir = workspaceDirShell();
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && (git checkout -f -b ${quotedBranch} ${quotedRemoteBranch} || git checkout -f --no-track -b ${quotedBranch} ${quotedBase})`,
      30,
    );
    await pinBranchUpstream(sandbox, branchName);
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
      // SDK checkoutBranch — simple checkout, no startpoint needed.
      // Uses WORKSPACE_DIR directly (SDK needs a real path, not a shell expression).
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

/** Copies baked sandbox config files into the codebase root after git cleanup. */
export async function copySandboxConfigFilesToWorkspace(
  sandbox: SandboxHandle,
  options?: { force?: boolean },
): Promise<void> {
  const workspaceDir = workspaceDirShell();
  const markerGuard =
    options?.force === true
      ? ""
      : 'if [ -f /tmp/.startup-commands-done ]; then echo "startup commands already ran; skipping sandbox-config copy"; exit 0; fi; ';
  await runLoggedGitStep(
    "copySandboxConfigFilesToWorkspace",
    WORKSPACE_DIR,
    async () => {
      await execGitCommand(
        sandbox,
        `${markerGuard}if [ -d /home/eva/sandbox-config ] && find /home/eva/sandbox-config -mindepth 1 -maxdepth 1 | read first; then cp -a /home/eva/sandbox-config/. ${workspaceDir}/; fi`,
        30,
      );
    },
  );
}

/** Installs project dependencies using the detected package manager. */
async function installDependencies(
  sandbox: SandboxHandle,
  pm: string,
): Promise<void> {
  const workspaceDir = workspaceDirShell();
  if (pm === "pnpm") {
    await execHandle(
      sandbox,
      `npm install -g pnpm && cd ${workspaceDir} && pnpm install`,
      PNPM_INSTALL_TIMEOUT_SECONDS,
    );
  } else if (pm === "yarn") {
    // Bare node24 has no yarn shim — mirror the pnpm branch's global install.
    await execHandle(
      sandbox,
      `npm install -g yarn && cd ${workspaceDir} && yarn install`,
      YARN_INSTALL_TIMEOUT_SECONDS,
    );
  } else {
    await execHandle(
      sandbox,
      `cd ${workspaceDir} && npm install`,
      NPM_INSTALL_TIMEOUT_SECONDS,
    );
  }
}

/** Best-effort pip for root requirements.txt / pyproject.toml (never throws). */
async function installPythonDependencies(
  sandbox: SandboxHandle,
): Promise<void> {
  const result = await installPythonDependenciesBestEffort(sandbox);
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
): Promise<void> {
  const details = `${owner}/${name}, installDeps=${shouldInstallDeps}`;
  await runLoggedGitStep("cloneAndSetupRepo", details, async () => {
    if (onProgress) await onProgress("Cloning repository...");
    const githubToken = await getInstallationToken(installationId);
    const repoUrl = `https://github.com/${owner}/${name}.git`;

    // SDK clone doesn't clean target dir — pre-clean workspace directories
    await execHandle(
      sandbox,
      `rm -rf ${quote([WORKSPACE_DIR])} ${quote([LEGACY_WORKSPACE_DIR])}`,
      30,
    );

    const maxCloneAttempts = 3;
    for (let attempt = 1; attempt <= maxCloneAttempts; attempt += 1) {
      try {
        await execSdkGitOperation(
          sandbox,
          `clone ${owner}/${name}`,
          () =>
            sandbox.git.clone(
              repoUrl,
              WORKSPACE_DIR,
              "x-access-token",
              githubToken,
            ),
          REPO_CLONE_TIMEOUT_SECONDS,
        );
        if (attempt > 1) {
          logGit(
            `cloneAndSetupRepo: clone recovered on attempt ${attempt}/${maxCloneAttempts} for ${owner}/${name}`,
          );
        }
        break;
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        const shouldRetry =
          attempt < maxCloneAttempts &&
          classifyGitFailure(error)._tag === "GitNetworkError";
        if (!shouldRetry) {
          throw error;
        }
        const delayMs = attempt * 2000;
        logGit(
          `cloneAndSetupRepo: clone retrying in ${delayMs}ms after attempt ${attempt}/${maxCloneAttempts} for ${owner}/${name}: ${error.message}`,
        );
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }

    // Install the credential helper after the clone so subsequent fetches /
    // pushes (here and from inside the sandbox) auth without URL tokens. The
    // initial SDK clone still uses an explicit token because the helper
    // can't be wired up before the .git directory exists.
    await ensureGitCredentialHelper(ctx, sandbox, installationId);

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
    // `--no-track`: `-B <branch> origin/<base>` would track the start point,
    // leaving the working branch pointing at the base branch.
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
  /**
   * Set when the local branch rewrote history that origin still holds and the
   * remote tip is provably the sandbox's own old tip. The push must then be
   * leased on exactly this sha so anything that lands in between aborts it.
   */
  replaceRemoteTip?: string;
};

/**
 * Every commit the local branch has ever pointed at in this sandbox. Empty when
 * the branch has no reflog, which makes the caller merge rather than force.
 */
async function localBranchReflogShas(
  sandbox: SandboxHandle,
  branchName: string,
): Promise<string[]> {
  const workspaceDir = workspaceDirShell();
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
      `localBranchReflogShas: no reflog for ${branchName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

/**
 * Refreshes the exact remote branch and makes the checked-out local branch a
 * safe fast-forward of it before publication.
 *
 * Local-only commits are never reset away. When both sides moved, Git merges
 * the fetched remote tip into the local branch; a conflict is aborted so the
 * preserved sandbox remains in its original recoverable state.
 *
 * Merge, not rebase: a turn that merges the base branch in (`git merge
 * origin/staging`) makes every base commit since the fork local-only, and a
 * rebase replays all of them onto the remote tip. Project 3 of
 * evalucom/carepulse-ts (19 Aug 2026) hit exactly that — 302 replayed commits,
 * conflicting on the base branch's own Mantine 9.3 bump — so a clean sandbox
 * merge could never publish, and every retry failed identically. A merge
 * conflicts only where the two tips genuinely touch the same lines.
 *
 * Skip that merge when the local branch rewrote its own history (task 231,
 * 25 Aug 2026): rebasing onto main left one local file against 1,272
 * remote-only staging commits, and merging the old tip back in conflicted
 * inside publish while the sandbox stayed clean. A rewrite is recognised by
 * the local branch's reflog holding the remote tip — the sandbox once had
 * every remote commit and moved off them on purpose — and an eva/ branch is
 * then published as a push leased on that exact tip.
 *
 * A remote tip the reflog never held was pushed by someone else, however many
 * files it touched, and is merged in like any concurrent work. Quick task 220
 * (evalucom/carepulse-ts, 2–3 Sep 2026) is why the file counts are not
 * consulted: GitHub had gained 118 commits on the PR branch, the sandbox one,
 * and a "many remote-only files" classifier refused twice what a merge fixed.
 */
async function synchronizeBranchForPublish(
  sandbox: SandboxHandle,
  owner: string,
  name: string,
  branchName: string,
): Promise<BranchPublishSync> {
  if (!isSafeBranchName(branchName)) {
    throw new Error(`Unsafe branch name: ${branchName}`);
  }

  const workspaceDir = workspaceDirShell();
  const currentBranch = (
    await execGitCommand(
      sandbox,
      `cd ${workspaceDir} && git branch --show-current`,
      10,
    )
  ).trim();
  if (currentBranch !== branchName) {
    // Self-heal the startup-checkout-failure shape (prod sessions eva/65 and
    // eva/66): checkoutSessionBranch failed, the run did its work on the base
    // branch, and refusing here strands that work in the sandbox. When the
    // session branch does not exist locally, every local commit is the
    // session's, so creating the branch at HEAD (touches no files) publishes
    // the work instead. An existing local session branch means HEAD and the
    // branch have diverged in an unknown way — keep refusing.
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
  });
  const remoteRefName = `refs/remotes/origin/${branchName}`;
  const quotedRemoteRef = quote([remoteRefName]);
  const quotedLocalRef = quote([`refs/heads/${branchName}`]);
  if (!fetched.includes(branchName)) {
    // An exact fetch that reports the branch missing is authoritative. Remove
    // a snapshot's stale tracking ref so the empty-turn gate cannot mistake a
    // deleted remote branch for a published one.
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
    // "<remote-only> <local-only>" commit counts, for the log and the error.
    const [remoteOnlyCommits, localOnlyCommits] = divergence.split(/\s+/);
    const remoteTip = (
      await execGitCommand(
        sandbox,
        `cd ${workspaceDir} && git rev-parse --verify ${quotedRemoteRef}`,
        10,
      )
    ).trim();
    const reflogShas = await localBranchReflogShas(sandbox, branchName);
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
        `synchronizeBranchForPublish: merge origin/${branchName} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        await execGitCommand(
          sandbox,
          `cd ${workspaceDir} && git merge --abort`,
          30,
        );
      } catch (abortError) {
        logGit(
          `synchronizeBranchForPublish: merge --abort failed: ${abortError instanceof Error ? abortError.message : String(abortError)}`,
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
  },
): Promise<{ pushed: boolean; published: boolean }> {
  const details = `${owner}/${name}, branch=${branchName}`;
  return await runLoggedGitStep("pushBranchToOrigin", details, async () => {
    const workspaceDir = workspaceDirShell();
    // Fully-qualified refspec, both sides. A bare branch name, `HEAD` or `@{u}`
    // can each resolve somewhere else (stale upstream, detached HEAD, a tag of
    // the same name); `refs/heads/x:refs/heads/x` names the exact ref to update.
    const quotedRefspec = quote([
      `refs/heads/${branchName}:refs/heads/${branchName}`,
    ]);
    const repoUrl = bareGitHubRepoUrl(owner, name);
    const maxAttempts = opts?.retryAttempts ?? 2;
    // Two shapes deserve another attempt: a transient network blip, and a
    // concurrent writer that moved the branch (resynchronize, then push again).
    const isRetryablePushFailure = (failure: GitFailure): boolean =>
      failure._tag === "GitNetworkError" ||
      failure._tag === "GitNonFastForwardError";
    let attempt = 0;
    // Everything up to the push runs through `Effect.promise`, so a failure
    // there is a defect: it surfaces as-is instead of being retried, which is
    // what the synchronize/gate steps did when they threw out of the old loop.
    // Every retry re-runs this, so the lease is recomputed against the remote
    // tip the fresh sync just observed.
    const resynchronize = Effect.promise(async () => {
      attempt += 1;
      const { remoteExists, replaceRemoteTip } =
        await synchronizeBranchForPublish(sandbox, owner, name, branchName);
      // Never a bare --force: the lease names the exact remote sha the sync
      // just verified as the sandbox's own old tip, so a commit that lands in
      // between is rejected ("stale info") and the retry re-syncs against it.
      const lease =
        replaceRemoteTip === undefined
          ? ""
          : `--force-with-lease=${quote([`refs/heads/${branchName}:${replaceRemoteTip}`])} `;

      // A chat/Q&A turn has nothing to publish. Once the remote session branch
      // exists, compare to that exact ref; otherwise compare to all fetched
      // refs so the first chat turn does not create an empty branch. Fail open
      // if the count itself fails: durability remains the critical path.
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
          `pushBranchToOrigin: ahead-of-remote gate failed, pushing anyway (${details}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return { remoteExists, hasUnpushedCommits: unpushedCount !== "0", lease };
    });

    return await runPromiseRethrowing(
      resynchronize.pipe(
        Effect.flatMap(({ remoteExists, hasUnpushedCommits, lease }) => {
          if (!hasUnpushedCommits) {
            logGit(
              `pushBranchToOrigin: skipped — HEAD has no commits origin lacks (${details})`,
            );
            return Effect.succeed({ pushed: false, published: remoteExists });
          }
          return Effect.tryPromise({
            try: () =>
              execGitCommand(
                sandbox,
                `${gitRemoteAuthPrefix(workspaceDir, repoUrl)} git push ${lease}-u origin ${quotedRefspec}`,
                opts?.timeoutSeconds ?? 60,
              ),
            catch: classifyGitFailure,
          }).pipe(
            Effect.as({ pushed: true, published: true }),
            Effect.tapError((failure) =>
              Effect.sync(() => {
                if (
                  attempt >= maxAttempts ||
                  !isRetryablePushFailure(failure)
                ) {
                  return;
                }
                const delayMs = 1000 * attempt;
                logGit(
                  `pushBranchToOrigin: remote moved or push was transient; refetching in ${delayMs}ms after attempt ${attempt}/${maxAttempts} (${details}): ${failure.message}`,
                );
              }),
            ),
          );
        }),
        Effect.retry({
          schedule: retryLinearBackoff(maxAttempts, 1000),
          while: isRetryablePushFailure,
        }),
        // Callers catch and ask `instanceof SandboxCommandFailedError`, so the
        // edge rethrows the error the git command actually threw.
        Effect.mapError((failure) => failure.cause),
      ),
    );
  });
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
): Promise<void> {
  if (!isSafeBranchName(branchName)) {
    throw new Error(`Unsafe branch name: ${branchName}`);
  }
  const details = `${owner}/${name}, branch=${branchName}`;
  await runLoggedGitStep("forcePushBranchToOrigin", details, async () => {
    const workspaceDir = workspaceDirShell();
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

/**
 * True when a create failed because the requested snapshot itself is unusable,
 * so the caller can retry without it (bare sandbox + fresh clone).
 *
 * Two shapes, because repos configured before the Vercel migration may still
 * carry a Daytona-era snapshot name (e.g. `seeded-<repoId>`) that Vercel has
 * never heard of:
 *
 * - Daytona-era state errors ("Snapshot X is error"), still matched so legacy
 *   messages surfacing from stored data keep working.
 * - Vercel not-found. `VercelSandboxClient.create` wraps failures as
 *   `vercel create failed (snapshot=<name>, ...): <API body>`, so we require
 *   that prefix with a real snapshot name before treating a 404 as a snapshot
 *   problem. Without that scoping, an unrelated not-found (a missing repo, say)
 *   would be silently downgraded to "clone instead" and hide the real fault.
 */
function isSnapshotUnusableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Snapshot\s+\S+\s+is\s+(error|build_failed)/i.test(msg)) return true;

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
  // VCR image to boot from when there is no snapshot (orchestrator sessions use
  // the Vercel-managed universal image). Threaded straight to createSandbox.
  image?: string,
  // Orchestrator: skip dockerd. See createSandbox.skipDocker.
  skipDocker = false,
): Promise<{ sandbox: SandboxHandle; usedSnapshot: boolean }> {
  let sandbox: SandboxHandle | undefined;
  try {
    const details = `${owner}/${name}, snapshot=${snapshotName ?? "none"}, image=${image ?? "none"}, syncStrategy=${syncStrategy.mode}`;
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
            image,
            skipDocker,
          );
        } catch (err) {
          if (effectiveSnapshot && isSnapshotUnusableError(err)) {
            logGit(
              `createSandboxAndPrepareRepo: snapshot ${effectiveSnapshot} is in error state — falling back to default snapshot + git clone (${err instanceof Error ? err.message : String(err)})`,
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
              image,
              skipDocker,
            );
          } else {
            throw err;
          }
        }
        if (effectiveSnapshot) {
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
          await ensureGitCredentialHelper(ctx, sandbox, installationId);
          if (syncStrategy.mode !== "none") {
            if (onProgress) await onProgress("Syncing repository...");
            await syncRepo(sandbox, owner, name, syncStrategy);
          }
          await copySandboxConfigFilesToWorkspace(sandbox, { force: true });
          return { sandbox, usedSnapshot: true };
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
          );
          return { sandbox, usedSnapshot: false };
        }
        await cloneAndSetupRepo(
          ctx,
          sandbox,
          installationId,
          owner,
          name,
          !lifecycle.ephemeral && !skipInstallDeps,
          onProgress,
        );
        if (syncStrategy.mode !== "none") {
          if (onProgress) await onProgress("Syncing repository...");
          await syncRepo(sandbox, owner, name, syncStrategy);
        }
        return { sandbox, usedSnapshot: false };
      },
    );
  } catch (error) {
    if (sandbox) {
      try {
        await sandbox.delete();
      } catch {}
      // Best-effort cleanup of the credential-helper row. No-op if absent.
      await ctx.runMutation(internal.sandboxGitCredentials.deleteBySandboxId, {
        sandboxId: sandbox.id,
      });
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
  // Both only matter on the create fallback below — a resume reuses whatever the
  // existing sandbox was built from. See createSandboxAndPrepareRepo.
  skipInstallDeps = false,
  image?: string,
  skipDocker = false,
): Promise<{
  sandbox: SandboxHandle;
  isNew: boolean;
  resumeFellBack: boolean;
}> {
  const details = `${owner}/${name}, existingSandboxId=${existingSandboxId ?? "none"}, snapshot=${snapshotName ?? "none"}, image=${image ?? "none"}, syncStrategy=${syncStrategy.mode}`;
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
      undefined,
      skipInstallDeps,
      image,
      skipDocker,
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
  let attempt = 0;
  const resumeOnce = Effect.suspend(() => {
    attempt += 1;
    return Effect.tryPromise({
      try: async (): Promise<SandboxHandle | null> => {
        if (onProgress) await onProgress("Resuming sandbox...");
        const sandbox = await client.get(existingSandboxId);
        try {
          await sandbox.refresh();
        } catch (refreshErr) {
          if (isSandboxMissingError(refreshErr)) {
            logGit(
              `getOrCreateSandbox: resume refresh says gone — will create new one (${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)})`,
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
        await ensureGitCredentialHelper(ctx, sandbox, installationId);
        if (syncStrategy.mode !== "none") {
          if (onProgress) await onProgress("Syncing repository...");
          await syncRepo(sandbox, owner, name, syncStrategy);
        }
        return sandbox;
      },
      catch: (err) => err,
    });
  });

  return await runPromiseRethrowing(
    resumeOnce.pipe(
      Effect.tapError((err) =>
        Effect.sync(() => {
          if (attempt >= maxAttempts || isSandboxMissingError(err)) return;
          const delay = backoffMs[attempt - 1] ?? 8000;
          logGit(
            `getOrCreateSandbox: resume attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms — ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
      ),
      Effect.retry({
        schedule: retryAfterDelays(backoffMs),
        while: (err) => !isSandboxMissingError(err),
      }),
      // Unresumable (missing snap / deadline): do not burn another 180s retry.
      Effect.catchIf(isSandboxMissingError, (err) =>
        Effect.sync(() => {
          logGit(
            `getOrCreateSandbox: resume failed because sandbox is gone — will create new one (${err instanceof Error ? err.message : String(err)})`,
          );
          return null;
        }),
      ),
    ),
  );
}
