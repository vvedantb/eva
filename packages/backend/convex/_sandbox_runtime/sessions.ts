"use node";

import { v } from "convex/values";
import { formatDurationMsShort } from "@eva/shared/duration";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { DataModel, Id, Doc } from "../_generated/dataModel";
import {
  execHandle,
  getSandboxHandle,
  resolveSandboxContext,
  resolveSandboxClientOnly,
  ensureSandboxRunning,
  ensureDockerDaemon,
  RESUME_READY_TIMEOUT_SECONDS,
  errorMessage,
  sleep,
  workspaceDirShell,
  WORKSPACE_DIR,
} from "./helpers";
import {
  setupBranch,
  checkoutSessionBranch,
  createSandboxAndPrepareRepo,
  fetchBranchRefs,
  forcePushBranchToOrigin,
  isRetryableSessionStepError,
  isUnresolvedGitIndexError,
  recoverUnresolvedGitIndex,
  retryGitNetworkOperation,
  resolveBaseTarget,
  copySandboxConfigFilesToWorkspace,
  dependencyInstallCommand,
  SESSION_LIFECYCLE,
} from "./git";
import { SandboxGoneError, isSandboxGoneError } from "./sandboxErrors";
import {
  deleteSandboxAndCredentials,
  ensureGitCredentialHelper,
} from "./gitCredentials";
import { ensureSwapFile } from "./swap";
import type { SandboxClient, SandboxHandle } from "../_sandbox/provider";
import { sandboxOwnerKey, type SandboxOwner } from "../_sandbox/owner";
import {
  detectPackageManager,
  installPythonDependenciesBestEffort,
  startSessionServices,
} from "./devServer";
import {
  launchDevServerInVercelConsole,
  launchLinkedRepoDevServerInVercelConsole,
} from "../_pty/launchDevServerInVercelConsole";
import { runStartupCommandsDirect } from "./execution";
import { resolveVercelConsoleDevCommand } from "./vercelAppPorts";
import type { GenericActionCtx } from "convex/server";
import { startDesktopWithChrome } from "./desktop";

/**
 * Starts the app server in Preview Console (Vercel tmux) so Console can show
 * logs. `ownerKey` must match the Preview Console PTY owner
 * (`session-*` / `task-*` / `project-*`).
 *
 * Eva launches `exec next|vite -p <listen>` so customer package.json `-p`
 * flags cannot bind the wrong port. Proxy owns 3000.
 *
 * `dir` defaults to the primary repo's workspace root; only the primary uses
 * this path (framework auto-detection assumes `rootDir` is relative to it).
 * A linked repo's dev server goes through
 * `launchLinkedRepoDevServerInVercelConsole` instead, which skips detection
 * entirely — linked repos always have an explicit `devCommand`.
 */
export async function launchPreviewDevServer(
  handle: SandboxHandle,
  ownerKey: string,
  devCommand: string,
  devPort: number,
  rootDir: string,
  dir: string = WORKSPACE_DIR,
): Promise<void> {
  const resolved = await resolveVercelConsoleDevCommand(
    handle,
    rootDir,
    devPort,
    devCommand,
  );
  await launchDevServerInVercelConsole(
    handle,
    ownerKey,
    resolved.devCommand,
    resolved.listenPort,
    dir,
  );
}

/**
 * `startSessionServices` plus the chat alert for a failed seeded Supabase
 * restore — that failure is non-fatal so the dev server still launches, and
 * this alert is the only place the user sees it.
 */
export async function startServicesWithRestoreAlert(
  ctx: GenericActionCtx<DataModel>,
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">,
  handle: SandboxHandle,
  rootDir: string,
  repo: Doc<"githubRepos"> | null,
): Promise<{ port: number; devCommand: string }> {
  const services = await startSessionServices(
    handle,
    rootDir,
    devOverrides(repo),
  );
  if (services.restoreError !== undefined) {
    await ctx.runMutation(internal._chat.seededRestoreAlert.insert, {
      parentId,
      error: services.restoreError,
    });
  }
  return { port: services.port, devCommand: services.devCommand };
}

/** Per-app dev server overrides loaded from the githubRepos doc. */
function devOverrides(
  repo: Doc<"githubRepos"> | null,
): { devPort?: number; devCommand?: string } | undefined {
  if (!repo) return undefined;
  if (repo.devPort === undefined && repo.devCommand === undefined)
    return undefined;
  return { devPort: repo.devPort, devCommand: repo.devCommand };
}

/** Logs a session-scoped message with the sandbox/sessions prefix. */
function logSession(message: string): void {
  console.log(`[sandbox][sessions] ${message}`);
}

/** Runs an async step with timing logs and error reporting. */
async function runLoggedSessionStep<T>(
  label: string,
  details: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logSession(`${label} started${details ? ` (${details})` : ""}`);
  try {
    const result = await fn();
    logSession(
      `${label} completed in ${formatDurationMsShort(Date.now() - startedAt)}${details ? ` (${details})` : ""}`,
    );
    return result;
  } catch (error) {
    console.error(
      `[sandbox][sessions] ${label} failed after ${formatDurationMsShort(Date.now() - startedAt)}${details ? ` (${details})` : ""}: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Prefix the step label so downstream error surfaces (sandboxStartupWarning
    // errorDetail) say which step failed. Mutate rather than wrap to preserve
    // instanceof checks (e.g. SandboxStartAbortedError in startSessionSandbox).
    if (
      error instanceof Error &&
      !(error instanceof SandboxStartAbortedError)
    ) {
      // Message-less errors keep recurring here (~5min into startup) with no
      // identifying info; persist the constructor and top stack frames so the
      // next occurrence tells us which layer threw.
      const anonymousDetail = `failed with no error message (constructor=${error.constructor.name}, stack: ${(error.stack ?? "none").split("\n").slice(0, 4).join(" | ").slice(0, 400)})`;
      error.message = `${label}: ${errorMessage(error, anonymousDetail)}`;
    }
    throw error;
  }
}

/** One log line for a background/startup command run, or null when nothing ran. */
function describeCommandRun(
  kind: "background" | "startup",
  result: { ran: boolean; commandCount: number; errors: string[] },
): string | null {
  if (!result.ran || result.commandCount === 0) return null;
  const verb = kind === "background" ? "Launched" : "Ran";
  const errors =
    result.errors.length > 0 ? ` with errors: ${result.errors.join("; ")}` : "";
  return `${verb} ${result.commandCount} ${kind} command(s)${errors}`;
}

/** Launches the repo's background commands as a logged step. Returns whether they ran. */
async function runBackgroundCommandsStep(
  ctx: GenericActionCtx<DataModel>,
  step: string,
  sandboxDetails: string,
  args: {
    sandboxId: string;
    repoId: Id<"githubRepos">;
    sessionId?: Id<"sessions">;
  },
): Promise<boolean> {
  return await runLoggedSessionStep(step, sandboxDetails, async () => {
    const result = await ctx.runAction(
      internal.sandbox.runBackgroundCommands,
      args,
    );
    const line = describeCommandRun("background", result);
    if (line) logSession(line);
    return result.ran;
  });
}

/** Runs the repo's startup commands as a logged step. Returns per-command errors. */
async function runStartupCommandsStep(
  ctx: GenericActionCtx<DataModel>,
  step: string,
  sandboxDetails: string,
  args: { sandboxId: string; repoId: Id<"githubRepos">; force?: boolean },
): Promise<string[]> {
  return await runLoggedSessionStep(step, sandboxDetails, async () => {
    const result = await runStartupCommandsDirect(ctx, {
      sandboxId: args.sandboxId,
      repoId: args.repoId,
      force: args.force,
    });
    const line = describeCommandRun("startup", result);
    if (line) logSession(line);
    return result.errors;
  });
}

/** Resolves and logs the base ref target for a session branch. */
async function resolveSessionBaseRef(
  sandbox: SandboxHandle,
  repoOwner: string,
  repoName: string,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const { source } = await resolveBaseTarget(sandbox, baseBranch);
  logSession(
    `resolveSessionBaseRef source=${source} (repo=${repoOwner}/${repoName}, branch=${branchName}, base=${baseBranch})`,
  );
}

/** Checks out a session branch with automatic retry on transient git errors. */
async function checkoutSessionBranchWithRetry(
  sandbox: SandboxHandle,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const maxAttempts = 3;
  // One-shot: a reused VM whose previous run died mid-merge refuses every
  // checkout with "needs merge; resolve your current index first" — abort the
  // stale operation and retry. If recovery does not clear it, the next failure
  // throws as before; nothing else is reset away.
  let recoveredUnresolvedIndex = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await checkoutSessionBranch(sandbox, branchName, baseBranch);
      if (attempt > 1) {
        logSession(
          `checkoutSessionBranchWithRetry recovered on retry ${attempt}/${maxAttempts} (branch=${branchName}, base=${baseBranch})`,
        );
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt < maxAttempts &&
        !recoveredUnresolvedIndex &&
        isUnresolvedGitIndexError(message)
      ) {
        recoveredUnresolvedIndex = true;
        logSession(
          `checkoutSessionBranchWithRetry recovering unresolved git index (attempt ${attempt}/${maxAttempts}, branch=${branchName}, base=${baseBranch}): ${message}`,
        );
        try {
          await recoverUnresolvedGitIndex(sandbox);
        } catch (recoverError) {
          // Best-effort: the retried checkout below surfaces the real state.
          logSession(
            `checkoutSessionBranchWithRetry unresolved-index recovery failed (branch=${branchName}, base=${baseBranch}): ${errorMessage(recoverError, "recovery failed")}`,
          );
        }
        continue;
      }
      const canRetry =
        attempt < maxAttempts && isRetryableSessionStepError(message);
      if (!canRetry) {
        throw error;
      }
      const delayMs = 1000 * attempt;
      logSession(
        `checkoutSessionBranchWithRetry retrying after ${delayMs}ms (attempt ${attempt}/${maxAttempts}, branch=${branchName}, base=${baseBranch}): ${message}`,
      );
      await sleep(delayMs);
    }
  }
}

/**
 * Thrown by a resume/start when the user has requested a stop mid-flight. The
 * start action catches it, ensures the (possibly woken) VM is stopped, and
 * defers the terminal status to the stop flow — so a Stop that races a Start
 * never leaves a live orphan VM, a stuck `stopping` row, or a false
 * "Sandbox Error" for what was really a stop.
 */
class SandboxStartAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxStartAbortedError";
  }
}

/** True once the user has requested this session stop/close (Stop clicked). */
async function sessionStopRequested(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
): Promise<boolean> {
  const session = await ctx.runQuery(internal.sessions.getInternal, {
    id: sessionId,
  });
  return (
    !session || session.status === "stopping" || session.status === "closed"
  );
}

/**
 * Stop can land after early-ready and still leave reuse launching Convex and
 * the preview server. Those steps used to keep going, then a 6-minute readiness
 * watcher posted "startup unfinished" against the closed chat (session 125).
 */
async function abortReuseIfSessionStopped(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
  sandboxId: string,
): Promise<void> {
  if (await sessionStopRequested(ctx, sessionId)) {
    throw new SandboxStartAbortedError(
      `reuse aborted: stop requested for sandbox ${sandboxId}`,
    );
  }
}

/** True once the user has requested this task's sandbox stop/close. */
async function taskStopRequested(
  ctx: GenericActionCtx<DataModel>,
  taskId: Id<"agentTasks">,
): Promise<boolean> {
  const task = await ctx.runQuery(internal.agentTasks.getInternal, {
    id: taskId,
  });
  return (
    !task ||
    task.reviewTaskSandboxStatus === "stopping" ||
    task.reviewTaskSandboxStatus === "closed"
  );
}

/** True once the user has requested this project's sandbox stop/close. */
async function projectStopRequested(
  ctx: GenericActionCtx<DataModel>,
  projectId: Id<"projects">,
): Promise<boolean> {
  const project = await ctx.runQuery(internal.projects.getInternal, {
    id: projectId,
  });
  return (
    !project ||
    project.reviewProjectSandboxStatus === "stopping" ||
    project.reviewProjectSandboxStatus === "closed"
  );
}

/**
 * Shared resume ordering for reused sandboxes across session/task/project
 * reuse flows. Owns the drift-prone sequence so a fix lands in one place, not
 * four: wait for the VM (skipping docker + the ~14s post-resume exec probe),
 * unlock the UI via `onEarlyReady` as soon as it reports running, then start
 * docker, self-heal the git credential helper, and check out the branch.
 *
 * Callers supply the entity-specific progress message (`onRestoring`), the
 * early-ready mutation (`onEarlyReady`), and a `shouldAbort` predicate that
 * reports the user's stop intent. `shouldAbort` is polled before waking the VM
 * and before each post-wake exec, so a Stop that races this resume aborts
 * (throwing {@link SandboxStartAbortedError}) instead of running commands
 * against a stopping sandbox (which 422s) or resurrecting a stopped one.
 */
async function resumeReusedSandbox(
  ctx: GenericActionCtx<DataModel>,
  handle: SandboxHandle,
  opts: {
    installationId: number;
    repoOwner: string;
    repoName: string;
    branchName: string;
    baseBranch: string;
    onRestoring: () => Promise<void>;
    onEarlyReady: () => Promise<void>;
    shouldAbort?: () => Promise<boolean>;
  },
): Promise<void> {
  const abortIfStopRequested = async (): Promise<void> => {
    if (opts.shouldAbort && (await opts.shouldAbort())) {
      throw new SandboxStartAbortedError(
        `resume aborted: stop requested for sandbox ${handle.id}`,
      );
    }
  };
  // Don't wake a VM the user has already asked to stop.
  await abortIfStopRequested();
  try {
    await handle.refresh();
  } catch (refreshErr) {
    // Rethrown as a typed verdict, not a prefixed string: the caller that
    // decides whether to mint a replacement re-inspects this error, and a
    // string prefix is exactly the signal that used to be forgeable by any
    // command output that happened to be quoted into a message.
    if (isSandboxGoneError(refreshErr)) {
      throw new SandboxGoneError(
        `sandbox gone on refresh: ${errorMessage(refreshErr, "refresh failed")}`,
      );
    }
    throw refreshErr;
  }
  if (handle.state === "gone" || handle.state === "error") {
    throw new SandboxGoneError(`sandbox unresumable state: ${handle.state}`);
  }
  await ensureSandboxRunning(handle, {
    timeoutSeconds: RESUME_READY_TIMEOUT_SECONDS,
    skipDocker: true,
    // Skip the ~14s post-resume exec probe: start() already verified the
    // session reports running, and the git steps right after early-ready
    // surface any real failure.
    skipExecProbe: true,
    // Explicit user start: if the previous run's stop is still snapshotting,
    // wait it out and resume instead of refusing. `shouldAbort` above still
    // catches a genuine user Stop.
    resumeAfterStop: true,
    onRestoring: opts.onRestoring,
  });
  // A Stop may have landed while start() was waking the VM — bail before the
  // exec steps rather than run commands against a now-stopping sandbox.
  await abortIfStopRequested();
  // Unlock chat/tabs as soon as the VM is up — docker/git/services continue.
  await opts.onEarlyReady();
  // ensureSandboxRunning skipped the per-boot bootstrap to unlock sooner; pay
  // it here, swap first, before any service can spike memory.
  await ensureSwapFile(handle);
  await ensureDockerDaemon(handle);
  await abortIfStopRequested();
  // Self-heal: rotate the per-sandbox secret + reinstall the helper every
  // resume so in-sandbox `git pull` and any subsequent fetch authenticate
  // without relying on a stale URL-embedded token.
  await ensureGitCredentialHelper(ctx, handle, opts.installationId, {
    owner: opts.repoOwner,
    name: opts.repoName,
  });
  await checkoutSessionBranchWithRetry(
    handle,
    opts.branchName,
    opts.baseBranch,
  );
}

/** Syncs remote refs for session restore, falling back to base branch if session branch is missing. */
async function syncSessionRefsForRestore(
  sandbox: SandboxHandle,
  repoOwner: string,
  repoName: string,
  branchName: string,
  baseBranch: string,
  // When set, also fetch the base branch so `origin/<base>` is refreshed to the
  // latest commit before the branch is (re)created from it — otherwise a new
  // session inherits whatever stale base the snapshot baked. Opt-in so the
  // task/project restore callers keep their session-branch-only fetch.
  opts?: { refreshBase?: boolean },
): Promise<void> {
  const branchesToFetch = opts?.refreshBase
    ? [baseBranch, branchName]
    : [branchName];
  let fetchedSessionBranches: string[] = [];
  try {
    fetchedSessionBranches = await fetchBranchRefs(
      sandbox,
      repoOwner,
      repoName,
      branchesToFetch,
      {
        prune: false,
        timeoutSeconds: 60,
        retryAttempts: 1,
      },
    );
  } catch (error) {
    logSession(
      `syncSessionRefsForRestore session branch fetch failed, continuing with local snapshot refs (repo=${repoOwner}/${repoName}, branch=${branchName}, base=${baseBranch}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  logSession(
    `syncSessionRefsForRestore fetched session branch candidates=${fetchedSessionBranches.join(",") || "none"} (repo=${repoOwner}/${repoName}, branch=${branchName})`,
  );
  if (fetchedSessionBranches.includes(branchName)) {
    logSession(
      `syncSessionRefsForRestore fetched existing remote session branch (repo=${repoOwner}/${repoName}, branch=${branchName})`,
    );
    return;
  }
  logSession(
    `syncSessionRefsForRestore remote session branch missing, falling back to base branch restore (repo=${repoOwner}/${repoName}, branch=${branchName}, base=${baseBranch})`,
  );
  await resolveSessionBaseRef(
    sandbox,
    repoOwner,
    repoName,
    branchName,
    baseBranch,
  );
}

/** Installs project dependencies after snapshot restore, with retry on transient failures. */
async function installSnapshotDependenciesWithRetry(
  sandbox: SandboxHandle,
  rootDir: string,
): Promise<void> {
  const pm = await detectPackageManager(sandbox, rootDir);
  const workspaceRoot = workspaceDirShell();
  const dir = rootDir ? `${workspaceRoot}/${rootDir}` : workspaceRoot;
  // pnpm workspaces must install from the lockfile root (usually the repo root),
  // not from a nested app rootDirectory that only has package.json.
  const installCwd = pm === "pnpm" ? workspaceRoot : dir;
  const installCommand = dependencyInstallCommand(pm, installCwd);
  const timeoutSeconds = pm === "pnpm" ? 240 : 180;

  await retryGitNetworkOperation(
    "installSnapshotDependencies",
    `rootDir=${rootDir || "."}, pm=${pm}`,
    () => execHandle(sandbox, installCommand, timeoutSeconds),
    3,
    1000,
    isRetryableSessionStepError,
  );
}

/**
 * Whether Node and/or Python dependency manifests drifted between the
 * snapshot's baked commit (`bakedSha`) and HEAD. Split so a Python-only change
 * does not trigger a Node reinstall (which can fail on yarn repos and kill the
 * session).
 */
async function lockfileDrifted(
  sandbox: SandboxHandle,
  rootDir: string,
  bakedSha: string,
): Promise<{ node: boolean; python: boolean }> {
  const pm = await detectPackageManager(sandbox, rootDir);
  const lockfile =
    pm === "pnpm"
      ? "pnpm-lock.yaml"
      : pm === "yarn"
        ? "yarn.lock"
        : "package-lock.json";
  // pnpm resolves its lockfile at the workspace (lockfile) root; npm/yarn keep
  // it beside the app package.json under rootDir.
  const lockPath =
    pm === "pnpm" || !rootDir ? lockfile : `${rootDir}/${lockfile}`;
  const workspaceRoot = workspaceDirShell();
  // `git diff --quiet` exits 1 on difference, which execHandle would throw on —
  // trap both outcomes into printed markers and read those instead. Missing
  // Python paths diff clean (no drift).
  const out = await execHandle(
    sandbox,
    [
      `cd ${workspaceRoot}`,
      `(git diff --quiet ${bakedSha} HEAD -- ${lockPath} && printf NODE_SAME || printf NODE_DRIFT)`,
      `printf ' '`,
      `(git diff --quiet ${bakedSha} HEAD -- requirements.txt requirements/ pyproject.toml && printf PY_SAME || printf PY_DRIFT)`,
    ].join(" && "),
    30,
  );
  const node = out.includes("NODE_DRIFT");
  const python = out.includes("PY_DRIFT");
  logSession(
    `lockfileDrifted pm=${pm} lockPath=${lockPath} bakedSha=${bakedSha.slice(0, 8)} node=${node} python=${python}`,
  );
  return { node, python };
}

type TryReuseSandboxOptions = {
  fallbackOnPrepareError?: boolean;
};

/**
 * Attempts to reuse an existing sandbox by running a preparation function on it.
 * Only a missing/deleted/unresumable sandbox should fall through to creating a
 * replacement; failed preparation on a found sandbox usually means the old
 * filesystem is still the user's source of truth and must not be silently
 * abandoned — except when the resume itself proves the snapshot is gone.
 *
 * `label` prefixes the diagnostic logs so different callers stay
 * distinguishable in the logs.
 */
async function tryReuseSandboxWith<T>(
  label: string,
  get: (id: string) => Promise<T>,
  existingSandboxId: string | undefined,
  prepareFn: (sandbox: T) => Promise<void>,
  options?: TryReuseSandboxOptions,
): Promise<T | null> {
  if (!existingSandboxId) return null;
  let sandbox: T;
  try {
    sandbox = await get(existingSandboxId);
  } catch (error) {
    if (isSandboxGoneError(error)) {
      logSession(
        `${label} found missing sandbox ${existingSandboxId}; creating replacement`,
      );
      return null;
    }
    throw error;
  }

  try {
    await prepareFn(sandbox);
  } catch (error) {
    const message = errorMessage(error, "preparation failed");
    // Snapshot gone / resume deadline: fall through even when
    // fallbackOnPrepareError is false — otherwise sessions hang then hard-fail.
    if (isSandboxGoneError(error)) {
      logSession(
        `${label} found unresumable sandbox ${existingSandboxId}; creating replacement: ${message}`,
      );
      return null;
    }
    if (options?.fallbackOnPrepareError === false) {
      throw error;
    }
    logSession(
      `${label} preparation failed for ${existingSandboxId}; creating replacement: ${message}`,
    );
    return null;
  }

  return sandbox;
}

/**
 * After reuse returns null, refuse to mint a replacement while the old id is
 * still a live VM. A false "sandbox gone" matcher used to orphan the original
 * and leave two running boxes billed against the same session.
 */
async function refuseReplacementIfStillAlive(
  client: SandboxClient,
  existingSandboxId: string,
): Promise<void> {
  let handle: SandboxHandle;
  try {
    handle = await client.get(existingSandboxId);
  } catch (error) {
    if (isSandboxGoneError(error)) return;
    throw error instanceof Error
      ? error
      : new Error(errorMessage(error, "sandbox lookup failed"));
  }
  const classification = await handle.classifyForReconcile();
  if (classification !== "alive") return;
  throw new Error(
    `refusing to replace live sandbox ${existingSandboxId} after reuse failed`,
  );
}

/** Reuse a provider-neutral sandbox handle by id (see {@link tryReuseSandboxWith}). */
function tryReuseSandboxHandle(
  client: SandboxClient,
  existingSandboxId: string | undefined,
  prepareFn: (sandbox: SandboxHandle) => Promise<void>,
  options?: TryReuseSandboxOptions,
): Promise<SandboxHandle | null> {
  return tryReuseSandboxWith(
    "tryReuseSandboxHandle",
    (id) => client.get(id),
    existingSandboxId,
    prepareFn,
    options,
  );
}

type SessionSandboxPreparationArgs = {
  sessionId: Id<"sessions">;
  existingSandboxId: string | undefined;
  installationId: number;
  repoOwner: string;
  repoName: string;
  branchName: string;
  baseBranch: string;
  repoId: Id<"githubRepos">;
  startDesktop: boolean;
  /**
   * True when the session also has `sessionRepos` rows to clone into
   * `/tmp/workspace`. Set by both `startSandbox` paths (create and resume —
   * a resume that falls through to a fresh sandbox has to re-clone them) so
   * the setup-pending flag stays armed until
   * `sessionSandboxStartupWorkflow` has provisioned every row. Absent
   * (`prepareSessionSandbox`, used by `sessionExecuteWorkflow`) behaves as
   * false: that path runs mid-session, long after provisioning.
   */
  hasLinkedRepos?: boolean;
};

type PreparedSessionSandbox = {
  sandbox: SandboxHandle;
  isNew: boolean;
  usedSnapshot: boolean;
  sandboxDetails: string;
  branchName: string;
  /** Present when startSessionServices completed; absent on early-ready soft keep. */
  devPort?: number;
  devCommand?: string;
  /** True when an existing sandbox id was unresumable and we created fresh. */
  resumeFellBack: boolean;
  /** The Vercel sandbox id (Vercel is the only sandbox provider). */
};

type ProgressStep = { type: string; label: string; status: string };

/** Emits progress steps to a streaming entity for UI updates. */
async function emitProgress(
  ctx: GenericActionCtx<DataModel>,
  entityId: string,
  completedSteps: ProgressStep[],
  activeLabel: string,
): Promise<void> {
  const steps = [
    ...completedSteps,
    { type: "tool", label: activeLabel, status: "active" },
  ];
  await ctx.runMutation(internal.streaming.internalSet, {
    entityId,
    currentActivity: JSON.stringify(steps),
  });
}

/** Clears the streaming activity for an entity when startup is done. */
async function clearProgress(
  ctx: GenericActionCtx<DataModel>,
  entityId: string,
): Promise<void> {
  await ctx.runMutation(internal.streaming.internalSet, {
    entityId,
    currentActivity: JSON.stringify([]),
  });
}

/** Emits session sandbox startup progress steps to streaming for UI updates. */
function emitSessionProgress(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
  completedSteps: ProgressStep[],
  activeLabel: string,
): Promise<void> {
  return emitProgress(
    ctx,
    `session-startup-${sessionId}`,
    completedSteps,
    activeLabel,
  );
}

/** Marks the final step complete and clears streaming. */
function completeSessionProgress(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
): Promise<void> {
  return clearProgress(ctx, `session-startup-${sessionId}`);
}

/** Emits task sandbox startup progress steps to streaming for UI updates. */
function emitTaskProgress(
  ctx: GenericActionCtx<DataModel>,
  taskId: Id<"agentTasks">,
  completedSteps: ProgressStep[],
  activeLabel: string,
): Promise<void> {
  return emitProgress(
    ctx,
    `task-sandbox-startup-${taskId}`,
    completedSteps,
    activeLabel,
  );
}

/** Clears task sandbox startup streaming when done. */
function completeTaskProgress(
  ctx: GenericActionCtx<DataModel>,
  taskId: Id<"agentTasks">,
): Promise<void> {
  return clearProgress(ctx, `task-sandbox-startup-${taskId}`);
}

/** Emits project sandbox startup progress steps to streaming for UI updates. */
function emitProjectProgress(
  ctx: GenericActionCtx<DataModel>,
  projectId: Id<"projects">,
  completedSteps: ProgressStep[],
  activeLabel: string,
): Promise<void> {
  return emitProgress(
    ctx,
    `project-sandbox-startup-${projectId}`,
    completedSteps,
    activeLabel,
  );
}

/** Clears project sandbox startup streaming when done. */
function completeProjectProgress(
  ctx: GenericActionCtx<DataModel>,
  projectId: Id<"projects">,
): Promise<void> {
  return clearProgress(ctx, `project-sandbox-startup-${projectId}`);
}

/** Core logic for preparing a session sandbox: reuses existing or creates new, syncs refs, and starts services. */
async function prepareSessionSandboxInternal(
  ctx: GenericActionCtx<DataModel>,
  args: SessionSandboxPreparationArgs,
): Promise<PreparedSessionSandbox> {
  // Total wall-clock budget for this call, logged at every exit point below
  // so slow session starts can be attributed to reuse vs. fresh-create vs.
  // provider without re-deriving it from scattered per-step timings.
  const startedAt = Date.now();
  const actionDetails = `sessionId=${args.sessionId}, repo=${args.repoOwner}/${args.repoName}, branch=${args.branchName}, base=${args.baseBranch}, existingSandboxId=${args.existingSandboxId ?? "none"}`;
  const completedSteps: ProgressStep[] = [];

  await emitSessionProgress(
    ctx,
    args.sessionId,
    completedSteps,
    "Loading repository config...",
  );
  const repo = await runLoggedSessionStep(
    "loadSessionRepo",
    actionDetails,
    () =>
      ctx.runQuery(internal.githubRepos.getInternal, {
        id: args.repoId,
      }),
  );
  const rootDir = repo?.rootDirectory ?? "";
  const launchSession = await ctx.runQuery(internal.sessions.getInternal, {
    id: args.sessionId,
  });
  completedSteps.push({
    type: "tool",
    label: "Loading repository config...",
    status: "complete",
  });

  await emitSessionProgress(
    ctx,
    args.sessionId,
    completedSteps,
    "Resolving sandbox context...",
  );
  // Resume path: credentials-only client (no full env decrypt). Full context
  // (env map + snapshot) loads only if reuse fails and we create.
  const client = await runLoggedSessionStep(
    "resolveSessionSandboxClient",
    actionDetails,
    () => resolveSandboxClientOnly(ctx, args.repoId),
  );
  const reuseId = args.existingSandboxId;
  logSession(
    `prepareSessionSandbox client resolved (${actionDetails}, rootDir=${rootDir || "."})`,
  );
  completedSteps.push({
    type: "tool",
    label: "Resolving sandbox context...",
    status: "complete",
  });

  await emitSessionProgress(
    ctx,
    args.sessionId,
    completedSteps,
    "Checking existing sandbox...",
  );
  let reusedResult: PreparedSessionSandbox | null = null;
  const reusedHandle = await runLoggedSessionStep(
    "tryReuseSessionSandbox",
    actionDetails,
    () =>
      tryReuseSandboxHandle(
        client,
        reuseId,
        async (handle) => {
          const sandboxDetails = `${actionDetails}, sandboxId=${handle.id}`;
          await runLoggedSessionStep(
            "reuseSessionSandbox.prepare",
            sandboxDetails,
            () =>
              resumeReusedSandbox(ctx, handle, {
                installationId: args.installationId,
                repoOwner: args.repoOwner,
                repoName: args.repoName,
                branchName: args.branchName,
                baseBranch: args.baseBranch,
                onRestoring: () =>
                  emitSessionProgress(
                    ctx,
                    args.sessionId,
                    completedSteps,
                    // Vercel resume is snapshot wake, not Daytona cold storage.
                    "Resuming sandbox...",
                  ),
                onEarlyReady: async () => {
                  await ctx.runMutation(internal.sessions.sandboxReady, {
                    sessionId: args.sessionId,
                    sandboxId: handle.id,
                    branchName: args.branchName,
                    isNew: false,
                    usedSnapshot: false,
                    // Services are relaunched below; keep the Preview heal off
                    // this sandbox until then so it cannot double-launch them.
                    markServicesPending: true,
                  });
                },
                shouldAbort: () => sessionStopRequested(ctx, args.sessionId),
              }),
          );
          await runLoggedSessionStep(
            "reuseSessionSandbox.setupBranch",
            sandboxDetails,
            () => setupBranch(handle, args.branchName, args.baseBranch),
          );
          await runLoggedSessionStep(
            "reuseSessionSandbox.copyConfigFiles",
            sandboxDetails,
            () => copySandboxConfigFilesToWorkspace(handle),
          );
          const services = await runLoggedSessionStep(
            "reuseSessionSandbox.startSessionServices",
            sandboxDetails,
            () =>
              startServicesWithRestoreAlert(
                ctx,
                args.sessionId,
                handle,
                rootDir,
                repo,
              ),
          );
          const devPort = services.port;
          const devCommand = services.devCommand;
          if (args.startDesktop) {
            await runLoggedSessionStep(
              "reuseSessionSandbox.startDesktop",
              sandboxDetails,
              () => startDesktopWithChrome(handle),
            );
          }
          await abortReuseIfSessionStopped(ctx, args.sessionId, handle.id);
          await emitSessionProgress(
            ctx,
            args.sessionId,
            completedSteps,
            "Launching background commands...",
          );
          const reuseBgRan = await runBackgroundCommandsStep(
            ctx,
            "reuseSessionSandbox.runBackgroundCommands",
            sandboxDetails,
            {
              sandboxId: handle.id,
              repoId: args.repoId,
              sessionId: args.sessionId,
            },
          );
          if (reuseBgRan) {
            completedSteps.push({
              type: "tool",
              label: "Launching background commands...",
              status: "complete",
            });
          }
          await runStartupCommandsStep(
            ctx,
            "reuseSessionSandbox.runStartupCommands",
            sandboxDetails,
            { sandboxId: handle.id, repoId: args.repoId },
          );
          await abortReuseIfSessionStopped(ctx, args.sessionId, handle.id);
          await runLoggedSessionStep(
            "reuseSessionSandbox.launchDevServer",
            sandboxDetails,
            () =>
              launchPreviewDevServer(
                handle,
                `session-${args.sessionId}`,
                devCommand,
                devPort,
                rootDir,
              ),
          );
          // Resume is the only path that can relaunch linked repos' dev
          // servers: they were cloned by `prepareLinkedRepo` (run once, from
          // `sessionSandboxStartupWorkflow`, on the session's first-ever
          // create) and never re-run on a plain resume. Rows a create hasn't
          // reached yet (`clonedAt` unset) are silently skipped — nothing to
          // restart until they exist on disk.
          const linkedRows = await ctx.runQuery(
            internal.sessions.listLinkedReposInternal,
            { sessionId: args.sessionId },
          );
          for (const linkedRow of linkedRows) {
            if (
              linkedRow.clonedAt === undefined ||
              !linkedRow.devCommand ||
              linkedRow.devPort === undefined
            ) {
              continue;
            }
            await runLoggedSessionStep(
              "reuseSessionSandbox.launchLinkedRepoDevServer",
              `${sandboxDetails}, linkedRepo=${linkedRow.name}`,
              () =>
                launchLinkedRepoDevServerInVercelConsole(
                  handle,
                  `session-${args.sessionId}-${linkedRow.name}`,
                  linkedRow.path,
                  linkedRow.devCommand ?? "",
                  linkedRow.devPort ?? 0,
                ),
            );
          }
          reusedResult = {
            sandbox: handle,
            isNew: false,
            usedSnapshot: false,
            sandboxDetails,
            branchName: args.branchName,
            devPort,
            devCommand,
            resumeFellBack: false,
          };
        },
        // Never silently create a replacement when the existing sandbox is
        // still reachable — that orphans the old VM and loses workspace state.
        { fallbackOnPrepareError: false },
      ),
  );
  if (reusedHandle && reusedResult) {
    await completeSessionProgress(ctx, args.sessionId);
    logSession(
      `prepareSessionSandboxInternal summary: elapsed=${formatDurationMsShort(Date.now() - startedAt)}, path=vercel-reuse, isNew=false, usedSnapshot=false (${actionDetails})`,
    );
    return reusedResult;
  }
  if (reuseId) {
    await refuseReplacementIfStillAlive(client, reuseId);
  }
  completedSteps.push({
    type: "tool",
    label: "Checking existing sandbox...",
    status: "complete",
  });

  // Create path needs full env map + snapshot — load only after reuse failed.
  const { sandboxEnvVars, snapshotName } = await runLoggedSessionStep(
    "resolveSessionSandboxContext",
    actionDetails,
    () =>
      resolveSandboxContext(ctx, args.repoId, {
        repoGroupId: launchSession?.repoGroupId,
      }),
  );
  // A forked session's first sandbox is a Vercel fork of the source sandbox
  // (DBs included). A replacement for an expired fork sandbox boots the repo
  // snapshot instead, since the source may be gone by then.
  const forkFrom =
    reuseId === undefined ? launchSession?.forkSourceSandboxId : undefined;
  const bootsFromImage = Boolean(snapshotName) || forkFrom !== undefined;
  if (forkFrom) {
    // Check the source before forking: a create failure is too opaque to tell
    // "source deleted" from a transient. A gone source can never be forked, so
    // drop it — the next Start boots the repo snapshot instead of failing
    // forever — and still restart the source if the fork had stopped it.
    try {
      await client.get(forkFrom);
    } catch (error) {
      if (isSandboxGoneError(error)) {
        await ctx.runMutation(internal.sessions.settleForkSource, {
          sessionId: args.sessionId,
          sourceGone: true,
        });
        throw new Error(
          "The session this was forked from no longer has a sandbox, so its data can't be copied. Start again to boot without it.",
        );
      }
      throw error;
    }
  }

  if (reuseId) {
    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Previous sandbox expired — creating a fresh one...",
    );
    completedSteps.push({
      type: "tool",
      label: "Previous sandbox expired — creating a fresh one...",
      status: "complete",
    });
  }

  await emitSessionProgress(
    ctx,
    args.sessionId,
    completedSteps,
    "Creating sandbox...",
  );

  // Mark the session active as soon as the sandbox exists so the UI can chat /
  // open tabs while branch checkout + services finish in the background.
  // Snapshot restore is sub-second; the remaining work is what used to make
  // "new session" feel like 10–60s.
  let earlyReadyEmitted = false;
  const preparing = runLoggedSessionStep(
    "createSessionSandboxAndPrepareRepo",
    `${actionDetails}, forkFrom=${forkFrom ?? "none"}, snapshot=${snapshotName ?? "none"}`,
    () =>
      createSandboxAndPrepareRepo(
        ctx,
        client,
        args.installationId,
        args.repoOwner,
        args.repoName,
        sandboxEnvVars,
        SESSION_LIFECYCLE,
        snapshotName,
        async (sandbox) => {
          if (earlyReadyEmitted) return;
          earlyReadyEmitted = true;
          // Seed configured app port/command immediately so Preview doesn't
          // fall back to 3000 while startSessionServices is still running.
          const configured = repo ? devOverrides(repo) : undefined;
          await ctx.runMutation(internal.sessions.sandboxReady, {
            sessionId: args.sessionId,
            sandboxId: sandbox.id,
            branchName: args.branchName,
            isNew: true,
            usedSnapshot: bootsFromImage,
            resumeFellBack: reuseId !== undefined,
            // Snapshot restores keep a stale checkout + baked modules; gate the
            // queued first turn until the base pull + install below finish.
            // Linked repos gate it too, regardless of snapshot — they still
            // need to be cloned/installed after this action returns (see
            // `sessionSandboxStartupWorkflow`), and the workflow — not this
            // action — clears the gate once they're done.
            markSetupPending:
              bootsFromImage || args.hasLinkedRepos === true,
            // Background + startup commands have not run yet on this fresh VM;
            // keep the Preview heal off it until final-ready clears the flag.
            markServicesPending: true,
            ...(configured?.devPort !== undefined
              ? { devPort: configured.devPort }
              : {}),
            ...(configured?.devCommand !== undefined
              ? { devCommand: configured.devCommand }
              : {}),
          });
        },
        undefined,
        { mode: "none" },
        undefined,
        false,
        forkFrom,
      ),
  );
  // The fork has been taken (or has failed) once this settles: only now is it
  // safe to start the source again. Settled on both outcomes so a failed fork
  // never leaves the source parked; a retry forks the same source again.
  const prepared = forkFrom
    ? await preparing.finally(() =>
        ctx.runMutation(internal.sessions.settleForkSource, {
          sessionId: args.sessionId,
          sourceGone: false,
        }),
      )
    : await preparing;
  const handle = prepared.sandbox;
  const sandboxDetails = `${actionDetails}, sandboxId=${handle.id}, usedSnapshot=${prepared.usedSnapshot ? "true" : "false"}`;
  // Any setup step below (ref sync, branch checkout, config restore, seeded-
  // runtime restore, dev server) can throw. If early-ready already marked the
  // session active, the user may already be chatting — never delete that VM.
  // Only delete on failure when the UI never unlocked (no early-ready), else
  // the sandbox leaks unreferenced.
  let resolvedDevPort: number | undefined;
  let resolvedDevCommand: string | undefined;
  try {
    completedSteps.push({
      type: "tool",
      label: "Creating sandbox...",
      status: "complete",
    });

    // Snapshot restore leaves HEAD at the (possibly stale) baked commit whose
    // lockfile the baked node_modules were installed against. Capture it before
    // the checkout below moves HEAD to the latest base, so we can tell whether
    // deps drifted and an install is actually needed. Best-effort: on failure
    // leave it null and force an install rather than skip a needed one.
    let bakedSha: string | null = null;
    if (prepared.usedSnapshot) {
      try {
        bakedSha = (
          await execHandle(
            handle,
            `cd ${workspaceDirShell()} && git rev-parse HEAD`,
            15,
          )
        ).trim();
      } catch (revParseError) {
        logSession(
          `newSessionSandbox baked HEAD capture failed, forcing install (${sandboxDetails}): ${errorMessage(revParseError, "rev-parse failed")}`,
        );
      }
    }

    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Syncing repository refs...",
    );
    await runLoggedSessionStep(
      "newSessionSandbox.syncSessionRefsForRestore",
      sandboxDetails,
      () =>
        syncSessionRefsForRestore(
          handle,
          args.repoOwner,
          args.repoName,
          args.branchName,
          args.baseBranch,
          // Refresh origin/<base> so a brand-new session branch is created from
          // the latest base commit, not the snapshot's stale baked base.
          { refreshBase: true },
        ),
    );
    completedSteps.push({
      type: "tool",
      label: "Syncing repository refs...",
      status: "complete",
    });

    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Checking out branch...",
    );
    await runLoggedSessionStep(
      "newSessionSandbox.checkoutSessionBranch",
      sandboxDetails,
      () =>
        checkoutSessionBranchWithRetry(
          handle,
          args.branchName,
          args.baseBranch,
        ),
    );
    completedSteps.push({
      type: "tool",
      label: "Checking out branch...",
      status: "complete",
    });

    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Preparing branch...",
    );
    await runLoggedSessionStep(
      "newSessionSandbox.setupBranch",
      sandboxDetails,
      () => setupBranch(handle, args.branchName, args.baseBranch),
    );
    completedSteps.push({
      type: "tool",
      label: "Preparing branch...",
      status: "complete",
    });

    // Now on the latest base: reinstall only when the lockfile actually drifted
    // from the snapshot's baked commit, so the common no-dep-change session keeps
    // its fast baked node_modules. Fresh-clone (non-snapshot) sessions already
    // installed inside createSandboxAndPrepareRepo, so this is snapshot-only.
    if (prepared.usedSnapshot) {
      await emitSessionProgress(
        ctx,
        args.sessionId,
        completedSteps,
        "Updating dependencies...",
      );
      let drift = { node: true, python: true };
      if (bakedSha) {
        // Capture into a const so the closure sees a narrowed `string`, not the
        // outer `let string | null`.
        const sha = bakedSha;
        drift = await runLoggedSessionStep(
          "newSessionSandbox.checkLockfileDrift",
          sandboxDetails,
          () => lockfileDrifted(handle, rootDir, sha),
        );
      }
      if (drift.node) {
        await runLoggedSessionStep(
          "newSessionSandbox.installDependencies",
          sandboxDetails,
          () => installSnapshotDependenciesWithRetry(handle, rootDir),
        );
      }
      if (drift.python) {
        await runLoggedSessionStep(
          "newSessionSandbox.installPythonDependencies",
          sandboxDetails,
          async () => {
            const result = await installPythonDependenciesBestEffort(handle);
            if (result.attempted && !result.ok) {
              logSession(
                "newSessionSandbox.installPythonDependencies: pip failed (continuing)",
              );
            }
          },
        );
      }
      completedSteps.push({
        type: "tool",
        label: "Updating dependencies...",
        status: "complete",
      });
    }

    // Code is on the latest base and deps are current — release the gate so the
    // daemon can claim the queued first turn. Dev server / background / startup
    // commands below keep warming without blocking the agent. No-op when the
    // gate was never set (non-snapshot path).
    // Linked repos: leave the gate set. `sessionSandboxStartupWorkflow` still
    // has to clone/install every `sessionRepos` row after this action returns,
    // and it — not this action — clears the gate once that finishes (or fails).
    if (!args.hasLinkedRepos) {
      await ctx.runMutation(internal.sessions.clearSandboxSetupPending, {
        sessionId: args.sessionId,
      });
    }

    // Restore baked config files from /home/eva/sandbox-config into the workspace.
    // Skipped when usedSnapshot: createSandboxAndPrepareRepo already ran this
    // exact copy (force: true) on the snapshot-restore path, and the
    // checkout/setupBranch steps above don't touch untracked files, so
    // re-copying here would be a pure duplicate on the common Vercel path.
    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Restoring config files...",
    );
    if (!prepared.usedSnapshot) {
      await runLoggedSessionStep(
        "newSessionSandbox.copyConfigFiles",
        sandboxDetails,
        () =>
          copySandboxConfigFilesToWorkspace(handle, {
            force: true,
          }),
      );
    }
    completedSteps.push({
      type: "tool",
      label: "Restoring config files...",
      status: "complete",
    });

    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Starting dev server...",
    );
    const services = await runLoggedSessionStep(
      "newSessionSandbox.startSessionServices",
      sandboxDetails,
      () =>
        startServicesWithRestoreAlert(
          ctx,
          args.sessionId,
          handle,
          rootDir,
          repo,
        ),
    );
    resolvedDevPort = services.port;
    resolvedDevCommand = services.devCommand;
    completedSteps.push({
      type: "tool",
      label: "Starting dev server...",
      status: "complete",
    });

    if (args.startDesktop) {
      await emitSessionProgress(
        ctx,
        args.sessionId,
        completedSteps,
        "Starting desktop environment...",
      );
      await runLoggedSessionStep(
        "newSessionSandbox.startDesktop",
        sandboxDetails,
        () => startDesktopWithChrome(handle),
      );
      completedSteps.push({
        type: "tool",
        label: "Starting desktop environment...",
        status: "complete",
      });
    }

    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Launching background commands...",
    );
    const bgRan = await runBackgroundCommandsStep(
      ctx,
      "newSessionSandbox.runBackgroundCommands",
      sandboxDetails,
      {
        sandboxId: handle.id,
        repoId: args.repoId,
        sessionId: args.sessionId,
      },
    );
    if (bgRan) {
      completedSteps.push({
        type: "tool",
        label: "Launching background commands...",
        status: "complete",
      });
    }

    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Running startup commands...",
    );
    const startupCommandErrors = await runStartupCommandsStep(
      ctx,
      "newSessionSandbox.runStartupCommands",
      sandboxDetails,
      {
        sandboxId: handle.id,
        repoId: args.repoId,
        // Seeded snapshots ship `/tmp/.startup-commands-done` from the build;
        // force re-bootstrap on every fresh session sandbox so dockerd and
        // local services come back after Vercel snapshot restore.
        force: prepared.usedSnapshot ? true : undefined,
      },
    );
    // runStartupCommands collects per-command failures instead of throwing, so
    // without this they only reach transient console logs — surface them on the
    // session so the user can see why services are missing.
    if (startupCommandErrors.length > 0) {
      await ctx.runMutation(internal.sessions.sandboxStartupWarning, {
        sessionId: args.sessionId,
        error: startupCommandErrors
          .map((e) => (e.length > 500 ? `${e.slice(0, 500)}…` : e))
          .join("\n")
          .slice(0, 4000),
      });
    }
    completedSteps.push({
      type: "tool",
      label: "Running startup commands...",
      status: "complete",
    });

    if (resolvedDevCommand !== undefined && resolvedDevPort !== undefined) {
      const command = resolvedDevCommand;
      const port = resolvedDevPort;
      await runLoggedSessionStep(
        "newSessionSandbox.launchDevServer",
        sandboxDetails,
        () =>
          launchPreviewDevServer(
            handle,
            `session-${args.sessionId}`,
            command,
            port,
            rootDir,
          ),
      );
    }

    await completeSessionProgress(ctx, args.sessionId);
    logSession(
      `prepareSessionSandboxInternal summary: elapsed=${formatDurationMsShort(Date.now() - startedAt)}, path=new, isNew=true, usedSnapshot=${prepared.usedSnapshot} (${sandboxDetails})`,
    );
    return {
      sandbox: handle,
      isNew: true,
      usedSnapshot: prepared.usedSnapshot,
      sandboxDetails,
      branchName: args.branchName,
      devPort: resolvedDevPort,
      devCommand: resolvedDevCommand,
      resumeFellBack: reuseId !== undefined,
    };
  } catch (setupError) {
    const setupMessage = errorMessage(setupError, "setup failed");
    // Early-ready already unlocked chat on this VM. Deleting/closing here is
    // what nuked tomato-* mid-conversation when startup commands timed out.
    if (earlyReadyEmitted) {
      console.warn(
        `[sandbox][sessions] post-ready setup failed for ${handle.id}; keeping sandbox (session already active): ${setupMessage}`,
      );
      // Setup failed after early-ready gated the turn — release the gate so the
      // queued first turn still runs (against baked deps) rather than hanging
      // forever behind a flag that will never clear.
      await ctx.runMutation(internal.sessions.clearSandboxSetupPending, {
        sessionId: args.sessionId,
      });
      await ctx.runMutation(internal.sessions.sandboxStartupWarning, {
        sessionId: args.sessionId,
        error: setupMessage,
      });
      // Best-effort: still put the app server in Console if we got that far.
      if (resolvedDevCommand !== undefined && resolvedDevPort !== undefined) {
        try {
          await launchPreviewDevServer(
            handle,
            `session-${args.sessionId}`,
            resolvedDevCommand,
            resolvedDevPort,
            rootDir,
          );
        } catch (launchError) {
          console.warn(
            `[sandbox][sessions] soft-keep console launch failed for ${handle.id}: ${errorMessage(launchError, "launch failed")}`,
          );
        }
      }
      try {
        await completeSessionProgress(ctx, args.sessionId);
      } catch {}
      logSession(
        `prepareSessionSandboxInternal summary: elapsed=${formatDurationMsShort(Date.now() - startedAt)}, path=new-soft-keep, isNew=true, usedSnapshot=${prepared.usedSnapshot} (${sandboxDetails})`,
      );
      return {
        sandbox: handle,
        isNew: true,
        usedSnapshot: prepared.usedSnapshot,
        sandboxDetails,
        branchName: args.branchName,
        devPort: resolvedDevPort,
        devCommand: resolvedDevCommand,
        resumeFellBack: reuseId !== undefined,
      };
    }
    console.warn(
      `[sandbox][sessions] deleting failed new session sandbox ${handle.id}: ${setupMessage}`,
    );
    await deleteSandboxAndCredentials(ctx, handle);
    throw setupError;
  }
}

/**
 * Executes the user-confirmed force-push after a publish refused a rewritten
 * local branch (see rewrittenBranchPublishError). The outcome lands in the
 * session chat either way: the recovery banner that scheduled this has no
 * other channel to report back on.
 */
export const performForcePushBranch = internalAction({
  args: {
    sessionId: v.id("sessions"),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    /** When set, force-push this linked repo's clone instead of the primary. */
    sessionRepoId: v.optional(v.id("sessionRepos")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      let owner = args.repoOwner;
      let name = args.repoName;
      let branchName = args.branchName;
      let workspaceDir: string | undefined;
      if (args.sessionRepoId !== undefined) {
        const linkedRepos = await ctx.runQuery(
          internal.sessions.listLinkedReposInternal,
          { sessionId: args.sessionId },
        );
        const linkedRepo = linkedRepos.find(
          (row) => row._id === args.sessionRepoId,
        );
        if (!linkedRepo) {
          throw new Error(
            `Linked repo ${args.sessionRepoId} not found for force-push`,
          );
        }
        owner = linkedRepo.owner;
        name = linkedRepo.name;
        branchName = linkedRepo.branchName;
        workspaceDir = linkedRepo.path;
      }
      await forcePushBranchToOrigin(sandbox, owner, name, branchName, {
        workspaceDir,
      });
      await ctx.runMutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId: args.sessionId,
        content: "Force-pushed session branch to GitHub",
      });
    } catch (error) {
      const errorDetail = errorMessage(error, "Force-push failed");
      console.error(
        `[sandbox][sessions] performForcePushBranch failed sessionId=${args.sessionId}: ${errorDetail}`,
      );
      await ctx.runMutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId: args.sessionId,
        content: "Force-push failed",
        errorDetail,
      });
    }
    return null;
  },
});

/** Starts a session sandbox end-to-end and notifies the session of readiness or error. */
export const startSessionSandbox = internalAction({
  args: {
    sessionId: v.id("sessions"),
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    repoId: v.optional(v.id("githubRepos")),
    /**
     * True when the session also has `sessionRepos` rows to clone into
     * `/tmp/workspace`. This action does not clone them: it arms
     * `sandboxSetupPending` and leaves it armed so the caller —
     * `sessionSandboxStartupWorkflow` — can run `prepareLinkedRepo` per row
     * and clear the gate once every row has been attempted.
     */
    hasLinkedRepos: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actionStartedAt = Date.now();
    const actionDetails = `sessionId=${args.sessionId}, repo=${args.repoOwner}/${args.repoName}, branch=${args.branchName}, base=${args.baseBranch}, existingSandboxId=${args.existingSandboxId ?? "none"}, linkedRepos=${args.hasLinkedRepos === true}`;
    logSession(`startSessionSandbox invoked (${actionDetails})`);
    try {
      if (!args.repoId) {
        throw new Error("repoId is required for startSessionSandbox");
      }
      // User may have clicked Stop after this action was scheduled. Abort before
      // any resume:true / create — otherwise we wake a VM the UI already left.
      const sessionBefore = await ctx.runQuery(internal.sessions.getInternal, {
        id: args.sessionId,
      });
      if (
        sessionBefore &&
        (sessionBefore.status === "stopping" ||
          sessionBefore.status === "closed")
      ) {
        console.log(
          `[sandbox][sessions] startSessionSandbox aborted sessionId=${args.sessionId} status=${sessionBefore.status}`,
        );
        return null;
      }
      const prepared = await prepareSessionSandboxInternal(ctx, {
        sessionId: args.sessionId,
        existingSandboxId: args.existingSandboxId,
        installationId: args.installationId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        branchName: args.branchName,
        baseBranch: args.baseBranch,
        repoId: args.repoId,
        startDesktop: false,
        hasLinkedRepos: args.hasLinkedRepos === true,
      });
      await runLoggedSessionStep(
        prepared.isNew
          ? "newSessionSandbox.sandboxReady"
          : "reuseSessionSandbox.sandboxReady",
        prepared.sandboxDetails,
        () =>
          ctx.runMutation(internal.sessions.sandboxReady, {
            sessionId: args.sessionId,
            sandboxId: prepared.sandbox.id,
            branchName: prepared.branchName,
            isNew: prepared.isNew,
            resumeFellBack: prepared.resumeFellBack,
            usedSnapshot: prepared.isNew ? prepared.usedSnapshot : undefined,
            devPort: prepared.devPort,
            devCommand: prepared.devCommand,
          }),
      );
      logSession(
        `startSessionSandbox completed in ${formatDurationMsShort(Date.now() - actionStartedAt)} (${prepared.sandboxDetails})`,
      );
    } catch (e) {
      const stopId = args.existingSandboxId;
      // A Stop that raced this Start. The resume may have briefly woken the VM,
      // so still stop it (idempotent with finalizeStopSandbox), but leave the
      // session status to the stop flow's markSandboxClosed — do NOT mark a
      // start error, or Eva shows a false "Sandbox Error" and the row can stick
      // in `stopping` while the two paths fight over status.
      if (e instanceof SandboxStartAbortedError) {
        console.log(
          `[sandbox][sessions] startSessionSandbox aborted by stop sessionId=${args.sessionId}: ${e.message}`,
        );
        if (args.repoId && stopId) {
          try {
            await ctx.runAction(internal.sandbox.stopSandbox, {
              sandboxId: stopId,
              repoId: args.repoId,
            });
          } catch (stopErr) {
            console.log(
              `[sandbox][sessions] stop after aborted start failed for ${stopId}: ${errorMessage(stopErr, "stop failed")}`,
            );
          }
        }
        return null;
      }
      const failMessage = errorMessage(e, "Unknown error");
      console.error(
        `[sandbox][sessions] startSessionSandbox failed after ${formatDurationMsShort(Date.now() - actionStartedAt)} (${actionDetails}): ${failMessage}`,
      );
      // Safety net: early-ready already flipped the session active with a live
      // sandbox. Never stop/close that — the user may already be mid-chat.
      const sessionAfter = await ctx.runQuery(internal.sessions.getInternal, {
        id: args.sessionId,
      });
      if (
        sessionAfter &&
        sessionAfter.status === "active" &&
        sessionAfter.sandboxId
      ) {
        console.warn(
          `[sandbox][sessions] startSessionSandbox failed after early-ready; keeping active sessionId=${args.sessionId} sandboxId=${sessionAfter.sandboxId}: ${failMessage}`,
        );
        // Final-ready never ran, so the Preview-heal gate armed at early-ready
        // would stay armed for the life of this sandbox and permanently
        // suppress background-daemon healing on it.
        await ctx.runMutation(internal.sessions.clearSandboxServicesPending, {
          sessionId: args.sessionId,
        });
        await ctx.runMutation(internal.sessions.sandboxStartupWarning, {
          sessionId: args.sessionId,
          error: failMessage,
        });
        return null;
      }
      // No early-ready — stop any id we were asked to reuse and mark closed.
      if (args.repoId && stopId) {
        try {
          await ctx.runAction(internal.sandbox.stopSandbox, {
            sandboxId: stopId,
            repoId: args.repoId,
          });
          console.log(
            `[sandbox][sessions] stopped sandbox ${stopId} after start failure`,
          );
        } catch (stopErr) {
          console.log(
            `[sandbox][sessions] stop after start failure failed for ${stopId}: ${errorMessage(stopErr, "stop failed")}`,
          );
        }
      }
      await ctx.runMutation(internal.sessions.sandboxError, {
        sessionId: args.sessionId,
        error: failMessage,
      });
    }
    return null;
  },
});

/** Prepares a session sandbox and returns the sandbox ID without notifying the session. */
export const prepareSessionSandbox = internalAction({
  args: {
    sessionId: v.id("sessions"),
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
    startDesktop: v.optional(v.boolean()),
  },
  returns: v.object({
    sandboxId: v.string(),
  }),
  handler: async (ctx, args) => {
    const prepared = await prepareSessionSandboxInternal(ctx, {
      sessionId: args.sessionId,
      existingSandboxId: args.existingSandboxId,
      installationId: args.installationId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      branchName: args.branchName,
      baseBranch: args.baseBranch,
      repoId: args.repoId,
      startDesktop: args.startDesktop === true,
    });
    return {
      sandboxId: prepared.sandbox.id,
    };
  },
});

/** Task and project preview sandboxes share one start path; the owner picks the hooks. */
type PreviewOwner = Extract<SandboxOwner, { kind: "task" | "project" }>;

type PreviewSandboxPreparationArgs = {
  owner: PreviewOwner;
  existingSandboxId?: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  branchName: string;
  baseBranch: string;
  repoId: Id<"githubRepos">;
  forceStartupCommands?: boolean;
  /** Skip background/startup commands and the dev server launch (e.g. project interview only reads files). */
  skipStartupCommands?: boolean;
};

type PreviewSandboxReady = {
  sandboxId: string;
  isNew: boolean;
  devPort?: number;
  devCommand?: string;
};

/** The owner-specific parts of a preview sandbox start; everything else is shared. */
type PreviewOwnerHooks = {
  label: "Task" | "Project";
  /** `taskId=…` / `projectId=…` for logs. */
  detail: string;
  /** Preview Console PTY owner key (`task-*` / `project-*`). */
  ownerKey: string;
  parentId: Id<"agentTasks"> | Id<"projects">;
  /**
   * Task: delete a just-created sandbox when setup fails so it does not leak.
   * Project: the sandbox is recorded via `afterCreate`, so it is tracked, not orphaned.
   */
  deleteOnSetupFailure: boolean;
  emit: (completedSteps: ProgressStep[], activeLabel: string) => Promise<void>;
  complete: () => Promise<void>;
  stopRequested: () => Promise<boolean>;
  starting: () => Promise<void>;
  afterCreate: (sandboxId: string) => Promise<void>;
  ready: (ready: PreviewSandboxReady) => Promise<void>;
  error: (message: string) => Promise<void>;
};

function previewOwnerHooks(
  ctx: GenericActionCtx<DataModel>,
  owner: PreviewOwner,
): PreviewOwnerHooks {
  const ownerKey = sandboxOwnerKey(owner);
  if (owner.kind === "task") {
    const { taskId } = owner;
    return {
      label: "Task",
      detail: `taskId=${taskId}`,
      ownerKey,
      parentId: taskId,
      deleteOnSetupFailure: true,
      emit: (completedSteps, activeLabel) =>
        emitTaskProgress(ctx, taskId, completedSteps, activeLabel),
      complete: () => completeTaskProgress(ctx, taskId),
      stopRequested: () => taskStopRequested(ctx, taskId),
      starting: async () => {},
      afterCreate: async () => {},
      ready: async (ready) => {
        await ctx.runMutation(internal.agentTasks.taskSandboxReady, {
          taskId,
          ...ready,
        });
      },
      error: async (error) => {
        await ctx.runMutation(internal.agentTasks.taskSandboxError, {
          taskId,
          error,
        });
      },
    };
  }
  const { projectId } = owner;
  return {
    label: "Project",
    detail: `projectId=${projectId}`,
    ownerKey,
    parentId: projectId,
    deleteOnSetupFailure: false,
    emit: (completedSteps, activeLabel) =>
      emitProjectProgress(ctx, projectId, completedSteps, activeLabel),
    complete: () => completeProjectProgress(ctx, projectId),
    stopRequested: () => projectStopRequested(ctx, projectId),
    starting: async () => {
      await ctx.runMutation(internal.projects.projectSandboxStarting, {
        projectId,
      });
    },
    afterCreate: async (sandboxId) => {
      await ctx.runMutation(internal.projects.projectSandboxAllocated, {
        projectId,
        sandboxId,
      });
    },
    ready: async (ready) => {
      await ctx.runMutation(internal.projects.projectSandboxReady, {
        projectId,
        ...ready,
      });
    },
    error: async (error) => {
      await ctx.runMutation(internal.projects.projectSandboxError, {
        projectId,
        error,
      });
    },
  };
}

function previewActionDetails(
  hooks: PreviewOwnerHooks,
  args: PreviewSandboxPreparationArgs,
): string {
  return `${hooks.detail}, repo=${args.repoOwner}/${args.repoName}, branch=${args.branchName}, base=${args.baseBranch}, existingSandboxId=${args.existingSandboxId ?? "none"}`;
}

/** Core logic for preparing a task/project preview sandbox: reuses existing or creates new, syncs refs, and starts services. */
async function preparePreviewSandboxInternal(
  ctx: GenericActionCtx<DataModel>,
  args: PreviewSandboxPreparationArgs,
  hooks: PreviewOwnerHooks,
): Promise<PreparedSessionSandbox> {
  const actionDetails = previewActionDetails(hooks, args);
  const completedSteps: ProgressStep[] = [];

  await hooks.emit(completedSteps, "Loading repository config...");
  const repo = await runLoggedSessionStep(
    `load${hooks.label}Repo`,
    actionDetails,
    () =>
      ctx.runQuery(internal.githubRepos.getInternal, {
        id: args.repoId,
      }),
  );
  const rootDir = repo?.rootDirectory ?? "";
  completedSteps.push({
    type: "tool",
    label: "Loading repository config...",
    status: "complete",
  });

  await hooks.emit(completedSteps, "Resolving sandbox context...");
  const client = await runLoggedSessionStep(
    `resolve${hooks.label}SandboxClient`,
    actionDetails,
    () => resolveSandboxClientOnly(ctx, args.repoId),
  );
  const reuseId = args.existingSandboxId;
  logSession(
    `prepare${hooks.label}PreviewSandbox client resolved (${actionDetails}, rootDir=${rootDir || "."})`,
  );
  completedSteps.push({
    type: "tool",
    label: "Resolving sandbox context...",
    status: "complete",
  });

  await hooks.emit(completedSteps, "Checking existing sandbox...");
  let reusedResult: PreparedSessionSandbox | null = null;
  const prepareReusedPreviewSandbox = async (
    handle: SandboxHandle,
  ): Promise<void> => {
    const sandboxDetails = `${actionDetails}, sandboxId=${handle.id}`;
    await hooks.emit(completedSteps, "Resuming existing sandbox...");
    await runLoggedSessionStep(
      `reuse${hooks.label}Sandbox.prepare`,
      sandboxDetails,
      () =>
        resumeReusedSandbox(ctx, handle, {
          installationId: args.installationId,
          repoOwner: args.repoOwner,
          repoName: args.repoName,
          branchName: args.branchName,
          baseBranch: args.baseBranch,
          onRestoring: () => hooks.emit(completedSteps, "Resuming sandbox..."),
          onEarlyReady: () =>
            hooks.ready({ sandboxId: handle.id, isNew: false }),
          shouldAbort: hooks.stopRequested,
        }),
    );
    completedSteps.push({
      type: "tool",
      label: "Resuming existing sandbox...",
      status: "complete",
    });
    // Restore baked config files from /home/eva/sandbox-config into the workspace.
    // The snapshot ships them; this re-copies in case `git clean -fd` wiped them.
    await hooks.emit(completedSteps, "Restoring config files...");
    await runLoggedSessionStep(
      `reuse${hooks.label}Sandbox.copyConfigFiles`,
      sandboxDetails,
      () => copySandboxConfigFilesToWorkspace(handle),
    );
    completedSteps.push({
      type: "tool",
      label: "Restoring config files...",
      status: "complete",
    });
    await hooks.emit(completedSteps, "Starting dev server...");
    const { port: devPort, devCommand } = await runLoggedSessionStep(
      `reuse${hooks.label}Sandbox.startSessionServices`,
      sandboxDetails,
      () =>
        startServicesWithRestoreAlert(
          ctx,
          hooks.parentId,
          handle,
          rootDir,
          repo,
        ),
    );
    completedSteps.push({
      type: "tool",
      label: "Starting dev server...",
      status: "complete",
    });
    if (!args.skipStartupCommands) {
      // Background before startup — startup may wait on bg logs (e.g. Convex ready).
      await hooks.emit(completedSteps, "Launching background commands...");
      await runBackgroundCommandsStep(
        ctx,
        `reuse${hooks.label}Sandbox.runBackgroundCommands`,
        sandboxDetails,
        { sandboxId: handle.id, repoId: args.repoId },
      );
      completedSteps.push({
        type: "tool",
        label: "Launching background commands...",
        status: "complete",
      });
      // Resume Start = background only (Convex/etc.). Do not re-run seed/import
      // startupCommands — that is one-time on create, or via Retry startup.
      if (args.forceStartupCommands) {
        await hooks.emit(completedSteps, "Running startup commands...");
        await runStartupCommandsStep(
          ctx,
          `reuse${hooks.label}Sandbox.runStartupCommands`,
          sandboxDetails,
          { sandboxId: handle.id, repoId: args.repoId, force: true },
        );
        completedSteps.push({
          type: "tool",
          label: "Running startup commands...",
          status: "complete",
        });
      }
      // Same as sessions: put the app in Preview Console (Vercel tmux).
      await runLoggedSessionStep(
        `reuse${hooks.label}Sandbox.launchDevServer`,
        sandboxDetails,
        () =>
          launchPreviewDevServer(
            handle,
            hooks.ownerKey,
            devCommand,
            devPort,
            rootDir,
          ),
      );
    }
    reusedResult = {
      sandbox: handle,
      isNew: false,
      usedSnapshot: false,
      sandboxDetails,
      branchName: args.branchName,
      devPort,
      devCommand,
      resumeFellBack: false,
    };
  };
  const reused = await runLoggedSessionStep(
    `tryReuse${hooks.label}Sandbox`,
    actionDetails,
    () =>
      tryReuseSandboxHandle(client, reuseId, prepareReusedPreviewSandbox, {
        fallbackOnPrepareError: false,
      }),
  );
  if (reused && reusedResult) {
    return reusedResult;
  }
  if (reuseId) {
    await refuseReplacementIfStillAlive(client, reuseId);
  }
  completedSteps.push({
    type: "tool",
    label: "Checking existing sandbox...",
    status: "complete",
  });

  const { sandboxEnvVars, snapshotName } = await runLoggedSessionStep(
    `resolve${hooks.label}SandboxContext`,
    actionDetails,
    () => resolveSandboxContext(ctx, args.repoId),
  );

  await hooks.emit(completedSteps, "Creating sandbox...");
  const prepared = await runLoggedSessionStep(
    `create${hooks.label}SandboxAndPrepareRepo`,
    `${actionDetails}, snapshot=${snapshotName ?? "none"}`,
    () =>
      createSandboxAndPrepareRepo(
        ctx,
        client,
        args.installationId,
        args.repoOwner,
        args.repoName,
        sandboxEnvVars,
        SESSION_LIFECYCLE,
        snapshotName,
        undefined,
        undefined,
        { mode: "none" },
      ),
  );
  const handle = prepared.sandbox;
  const sandboxDetails = `${actionDetails}, sandboxId=${handle.id}, usedSnapshot=${prepared.usedSnapshot ? "true" : "false"}`;
  await hooks.afterCreate(handle.id);
  try {
    completedSteps.push({
      type: "tool",
      label: "Creating sandbox...",
      status: "complete",
    });

    await hooks.emit(completedSteps, "Syncing repository refs...");
    await runLoggedSessionStep(
      `new${hooks.label}Sandbox.syncRefsForRestore`,
      sandboxDetails,
      () =>
        syncSessionRefsForRestore(
          handle,
          args.repoOwner,
          args.repoName,
          args.branchName,
          args.baseBranch,
        ),
    );
    completedSteps.push({
      type: "tool",
      label: "Syncing repository refs...",
      status: "complete",
    });

    await hooks.emit(completedSteps, "Checking out branch...");
    await runLoggedSessionStep(
      `new${hooks.label}Sandbox.checkoutBranch`,
      sandboxDetails,
      () =>
        checkoutSessionBranchWithRetry(
          handle,
          args.branchName,
          args.baseBranch,
        ),
    );
    completedSteps.push({
      type: "tool",
      label: "Checking out branch...",
      status: "complete",
    });

    // Restore baked config files from /home/eva/sandbox-config into the workspace.
    // Skipped when usedSnapshot: createSandboxAndPrepareRepo already ran this
    // exact copy (force: true) on the snapshot-restore path — see the
    // matching comment in prepareSessionSandboxInternal.
    await hooks.emit(completedSteps, "Restoring config files...");
    if (!prepared.usedSnapshot) {
      await runLoggedSessionStep(
        `new${hooks.label}Sandbox.copyConfigFiles`,
        sandboxDetails,
        () =>
          copySandboxConfigFilesToWorkspace(handle, {
            force: true,
          }),
      );
    }
    completedSteps.push({
      type: "tool",
      label: "Restoring config files...",
      status: "complete",
    });

    await hooks.emit(completedSteps, "Starting dev server...");
    const { port: devPort, devCommand } = await runLoggedSessionStep(
      `new${hooks.label}Sandbox.startSessionServices`,
      sandboxDetails,
      () =>
        startServicesWithRestoreAlert(
          ctx,
          hooks.parentId,
          handle,
          rootDir,
          repo,
        ),
    );
    completedSteps.push({
      type: "tool",
      label: "Starting dev server...",
      status: "complete",
    });

    if (!args.skipStartupCommands) {
      // Background before startup — startup may wait on bg logs (e.g. Convex ready).
      await hooks.emit(completedSteps, "Launching background commands...");
      await runBackgroundCommandsStep(
        ctx,
        `new${hooks.label}Sandbox.runBackgroundCommands`,
        sandboxDetails,
        { sandboxId: handle.id, repoId: args.repoId },
      );
      completedSteps.push({
        type: "tool",
        label: "Launching background commands...",
        status: "complete",
      });

      await hooks.emit(completedSteps, "Running startup commands...");
      await runStartupCommandsStep(
        ctx,
        `new${hooks.label}Sandbox.runStartupCommands`,
        sandboxDetails,
        {
          sandboxId: handle.id,
          repoId: args.repoId,
          force: args.forceStartupCommands,
        },
      );
      completedSteps.push({
        type: "tool",
        label: "Running startup commands...",
        status: "complete",
      });

      await runLoggedSessionStep(
        `new${hooks.label}Sandbox.launchDevServer`,
        sandboxDetails,
        () =>
          launchPreviewDevServer(
            handle,
            hooks.ownerKey,
            devCommand,
            devPort,
            rootDir,
          ),
      );
    }

    return {
      sandbox: handle,
      isNew: true,
      usedSnapshot: prepared.usedSnapshot,
      sandboxDetails,
      branchName: args.branchName,
      devPort,
      devCommand,
      resumeFellBack: reuseId !== undefined,
    };
  } catch (setupError) {
    if (hooks.deleteOnSetupFailure) {
      console.warn(
        `[sandbox][sessions] deleting failed new ${args.owner.kind} sandbox ${handle.id}: ${errorMessage(setupError, "setup failed")}`,
      );
      await deleteSandboxAndCredentials(ctx, handle);
    }
    throw setupError;
  }
}

/**
 * Starts a task/project preview sandbox end-to-end and notifies the owner of
 * readiness or error. Records the error and rethrows; a stop that races the
 * start returns the existing id after a best-effort stop.
 */
async function runPreviewStart(
  ctx: GenericActionCtx<DataModel>,
  args: PreviewSandboxPreparationArgs,
): Promise<{ sandboxId: string }> {
  const hooks = previewOwnerHooks(ctx, args.owner);
  const actionName = `start${hooks.label}PreviewSandbox`;
  const actionStartedAt = Date.now();
  const actionDetails = previewActionDetails(hooks, args);
  logSession(`${actionName} invoked (${actionDetails})`);
  try {
    await hooks.starting();
    const prepared = await preparePreviewSandboxInternal(ctx, args, hooks);
    await runLoggedSessionStep(
      prepared.isNew
        ? `new${hooks.label}Sandbox.sandboxReady`
        : `reuse${hooks.label}Sandbox.sandboxReady`,
      prepared.sandboxDetails,
      () =>
        hooks.ready({
          sandboxId: prepared.sandbox.id,
          isNew: prepared.isNew,
          devPort: prepared.devPort,
          devCommand: prepared.devCommand,
        }),
    );
    await hooks.complete();
    logSession(
      `${actionName} completed in ${formatDurationMsShort(Date.now() - actionStartedAt)} (${prepared.sandboxDetails})`,
    );
    return { sandboxId: prepared.sandbox.id };
  } catch (e) {
    if (e instanceof SandboxStartAbortedError) {
      console.log(
        `[sandbox][sessions] ${actionName} aborted by stop ${hooks.detail}: ${e.message}`,
      );
      await hooks.complete();
      const stopId = args.existingSandboxId;
      if (stopId) {
        try {
          await ctx.runAction(internal.sandbox.stopSandbox, {
            sandboxId: stopId,
            repoId: args.repoId,
          });
        } catch {}
      }
      return { sandboxId: stopId ?? "" };
    }
    console.error(
      `[sandbox][sessions] ${actionName} failed after ${formatDurationMsShort(Date.now() - actionStartedAt)} (${actionDetails}): ${errorMessage(e, "Unknown error")}`,
    );
    await hooks.complete();
    await hooks.error(errorMessage(e, "Unknown error"));
    throw e;
  }
}

/**
 * Starts a project preview sandbox end-to-end and notifies the project of
 * readiness or error. Returns the sandbox id on success so callers (e.g. the
 * interview/spec workflows) can launch agents on it without re-querying the
 * project doc — `projectSandboxReady` has already persisted it as well, so the
 * project card/sidebar indicator lights up.
 */
export const startProjectPreviewSandbox = internalAction({
  args: {
    projectId: v.id("projects"),
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
    forceStartupCommands: v.optional(v.boolean()),
    skipStartupCommands: v.optional(v.boolean()),
  },
  returns: v.object({ sandboxId: v.string() }),
  handler: (ctx, { projectId, ...args }) =>
    runPreviewStart(ctx, { owner: { kind: "project", projectId }, ...args }),
});

/** Starts a task preview sandbox end-to-end and notifies the task of readiness or error. */
export const startTaskPreviewSandbox = internalAction({
  args: {
    taskId: v.id("agentTasks"),
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
    forceStartupCommands: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, ...args }) => {
    try {
      await runPreviewStart(ctx, { owner: { kind: "task", taskId }, ...args });
    } catch {
      // runPreviewStart already logged the failure and recorded it on the
      // task; a task preview start never fails its caller.
    }
    return null;
  },
});
