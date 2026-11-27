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
  workspaceDirShell,
  WORKSPACE_DIR,
} from "./helpers";
import {
  checkoutSessionBranch,
  getUserCheckedOutBranch,
  createSandboxAndPrepareRepo,
  fetchBranchRefs,
  forcePushBranchToOrigin,
  isRetryableSessionStepError,
  isUnresolvedGitIndexError,
  recoverUnresolvedGitIndex,
  retryGitNetworkOperation,
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
import { sandboxOwnerKey, sandboxStartupEntityId } from "@eva/shared";
import type { ProgressStep } from "./startupProgress";
import { isSupersededStart } from "../_sandbox/transitions";
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
import { sleep } from "../_shared/async";
import { SANDBOX_GIT_WRITE } from "../githubAuth";
import {
  isReadOnlySandboxOwner,
  sessionSandboxProfile,
} from "../_sessions/owner";

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
  parentId: Id<"sessions">,
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

function devOverrides(
  repo: Doc<"githubRepos"> | null,
): { devPort?: number; devCommand?: string } | undefined {
  if (!repo) return undefined;
  if (repo.devPort === undefined && repo.devCommand === undefined)
    return undefined;
  return { devPort: repo.devPort, devCommand: repo.devCommand };
}

function logSession(message: string): void {
  console.log(`[sandbox][sessions] ${message}`);
}

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
    if (
      error instanceof Error &&
      !(error instanceof SandboxStartAbortedError)
    ) {
      const anonymousDetail = `failed with no error message (constructor=${error.constructor.name}, stack: ${(error.stack ?? "none").split("\n").slice(0, 4).join(" | ").slice(0, 400)})`;
      error.message = `${label}: ${errorMessage(error, anonymousDetail)}`;
    }
    throw error;
  }
}

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

async function checkoutSessionBranchWithRetry(
  sandbox: SandboxHandle,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const maxAttempts = 3;
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

class SandboxStartAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxStartAbortedError";
  }
}

async function sessionStopRequested(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
  startAttempt?: number,
): Promise<boolean> {
  const session = await ctx.runQuery(internal.sessions.getInternal, {
    id: sessionId,
  });
  return (
    !session ||
    session.status === "stopping" ||
    session.status === "closed" ||
    isSupersededStart(session.sandboxStartAttempt, startAttempt)
  );
}

async function abortReuseIfSessionStopped(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
  sandboxId: string,
  startAttempt?: number,
): Promise<void> {
  if (await sessionStopRequested(ctx, sessionId, startAttempt)) {
    throw new SandboxStartAbortedError(
      `reuse aborted: stop requested or start superseded for sandbox ${sandboxId}`,
    );
  }
}

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
  await abortIfStopRequested();
  try {
    await handle.refresh();
  } catch (refreshErr) {
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
    skipExecProbe: true,
    resumeAfterStop: true,
    onRestoring: opts.onRestoring,
  });
  await abortIfStopRequested();
  await opts.onEarlyReady();
  await ensureSwapFile(handle);
  await ensureDockerDaemon(handle);
  await abortIfStopRequested();
  await ensureGitCredentialHelper(ctx, handle, opts.installationId, {
    owner: opts.repoOwner,
    name: opts.repoName,
  });
  const userBranch = await getUserCheckedOutBranch(handle, opts.branchName);
  if (userBranch) {
    logSession(
      `resumeReusedSandbox keeping user branch ${userBranch} (session branch=${opts.branchName})`,
    );
    return;
  }
  await checkoutSessionBranchWithRetry(
    handle,
    opts.branchName,
    opts.baseBranch,
  );
}

async function syncSessionRefsForRestore(
  sandbox: SandboxHandle,
  repoOwner: string,
  repoName: string,
  branchName: string,
  baseBranch: string,
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
}

async function installSnapshotDependenciesWithRetry(
  sandbox: SandboxHandle,
  rootDir: string,
): Promise<void> {
  const pm = await detectPackageManager(sandbox, rootDir);
  const workspaceRoot = workspaceDirShell();
  const dir = rootDir ? `${workspaceRoot}/${rootDir}` : workspaceRoot;
  const installCwd = pm === "pnpm" ? workspaceRoot : dir;
  const installCommand = dependencyInstallCommand(pm, installCwd);
  const timeoutSeconds = pm === "pnpm" ? 240 : 180;

  await retryGitNetworkOperation(
    "installSnapshotDependencies",
    `rootDir=${rootDir || "."}, pm=${pm}`,
    () => execHandle(sandbox, installCommand, timeoutSeconds),
    { isRetryable: isRetryableSessionStepError },
  );
}

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
  const lockPath =
    pm === "pnpm" || !rootDir ? lockfile : `${rootDir}/${lockfile}`;
  const workspaceRoot = workspaceDirShell();
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
  startAttempt?: number;
  sessionId: Id<"sessions">;
  existingSandboxId: string | undefined;
  installationId: number;
  repoOwner: string;
  repoName: string;
  branchName: string;
  baseBranch: string;
  repoId: Id<"githubRepos">;
  startDesktop: boolean;
  hasLinkedRepos?: boolean;
};

type PreparedSessionSandbox = {
  sandbox: SandboxHandle;
  isNew: boolean;
  usedSnapshot: boolean;
  sandboxDetails: string;
  branchName: string;
  devPort?: number;
  devCommand?: string;
  resumeFellBack: boolean;
};

async function emitProgress(
  ctx: GenericActionCtx<DataModel>,
  entityId: string,
  completedSteps: ProgressStep[],
  activeLabel: string,
): Promise<void> {
  const steps: ProgressStep[] = [
    ...completedSteps,
    { type: "tool", label: activeLabel, status: "active" },
  ];
  await ctx.runMutation(internal.streaming.internalSet, {
    entityId,
    currentActivity: JSON.stringify(steps),
  });
}

async function clearProgress(
  ctx: GenericActionCtx<DataModel>,
  entityId: string,
): Promise<void> {
  await ctx.runMutation(internal.streaming.internalSet, {
    entityId,
    currentActivity: JSON.stringify([]),
  });
}

function emitSessionProgress(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
  completedSteps: ProgressStep[],
  activeLabel: string,
): Promise<void> {
  return emitProgress(
    ctx,
    sandboxStartupEntityId({ kind: "session", sessionId }),
    completedSteps,
    activeLabel,
  );
}

function completeSessionProgress(
  ctx: GenericActionCtx<DataModel>,
  sessionId: Id<"sessions">,
): Promise<void> {
  return clearProgress(
    ctx,
    sandboxStartupEntityId({ kind: "session", sessionId }),
  );
}

async function prepareSessionSandboxInternal(
  ctx: GenericActionCtx<DataModel>,
  args: SessionSandboxPreparationArgs,
): Promise<PreparedSessionSandbox> {
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
  const profile = sessionSandboxProfile(launchSession?.owner);
  const readOnly =
    launchSession !== null && isReadOnlySandboxOwner(launchSession.owner);
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
                    "Resuming sandbox...",
                  ),
                onEarlyReady: async () => {
                  await ctx.runMutation(internal.sessions.sandboxReady, {
                    sessionId: args.sessionId,
                    startAttempt: args.startAttempt,
                    sandboxId: handle.id,
                    branchName: args.branchName,
                    isNew: false,
                    usedSnapshot: false,
                    markServicesPending: true,
                  });
                },
                shouldAbort: () =>
                  sessionStopRequested(ctx, args.sessionId, args.startAttempt),
              }),
          );
          if (!profile.runsServices) {
            reusedResult = {
              sandbox: handle,
              isNew: false,
              usedSnapshot: false,
              sandboxDetails,
              branchName: args.branchName,
              devPort: undefined,
              devCommand: undefined,
              resumeFellBack: false,
            };
            return;
          }
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
          await abortReuseIfSessionStopped(
            ctx,
            args.sessionId,
            handle.id,
            args.startAttempt,
          );
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
          await abortReuseIfSessionStopped(
            ctx,
            args.sessionId,
            handle.id,
            args.startAttempt,
          );
          const [, linkedRows] = await Promise.all([
            runLoggedSessionStep(
              "reuseSessionSandbox.launchDevServer",
              sandboxDetails,
              () =>
                launchPreviewDevServer(
                  handle,
                  sandboxOwnerKey({ kind: "session", sessionId: args.sessionId }),
                  devCommand,
                  devPort,
                  rootDir,
                ),
            ),
            ctx.runQuery(internal.sessions.listLinkedReposInternal, {
              sessionId: args.sessionId,
            }),
          ]);
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
                  `${sandboxOwnerKey({ kind: "session", sessionId: args.sessionId })}-${linkedRow.name}`,
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

  const { sandboxEnvVars, snapshotName } = await runLoggedSessionStep(
    "resolveSessionSandboxContext",
    actionDetails,
    () =>
      resolveSandboxContext(ctx, args.repoId, {
        repoGroupId: launchSession?.repoGroupId,
        branch: args.branchName,
      }),
  );
  const forkFrom =
    reuseId === undefined ? launchSession?.forkSourceSandboxId : undefined;
  const bootsFromImage = Boolean(snapshotName) || forkFrom !== undefined;
  if (forkFrom) {
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
          const configured = repo ? devOverrides(repo) : undefined;
          await ctx.runMutation(internal.sessions.sandboxReady, {
            sessionId: args.sessionId,
            startAttempt: args.startAttempt,
            sandboxId: sandbox.id,
            branchName: args.branchName,
            isNew: true,
            usedSnapshot: bootsFromImage,
            resumeFellBack: reuseId !== undefined,
            markSetupPending: bootsFromImage || args.hasLinkedRepos === true,
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
        !profile.runsServices,
        forkFrom,
        undefined,
        true,
        profile.vcpus,
        readOnly
          ? {
              kind: "read",
              repo: { githubId: repo?.githubId, name: args.repoName },
            }
          : SANDBOX_GIT_WRITE,
      ),
  );
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
  let resolvedDevPort: number | undefined;
  let resolvedDevCommand: string | undefined;
  try {
    completedSteps.push({
      type: "tool",
      label: "Creating sandbox...",
      status: "complete",
    });

    const bakedShaPromise: Promise<string | null> = prepared.usedSnapshot
      ? execHandle(handle, `cd ${workspaceDirShell()} && git rev-parse HEAD`, 15)
          .then((output) => output.trim())
          .catch((revParseError: unknown) => {
            logSession(
              `newSessionSandbox baked HEAD capture failed, forcing install (${sandboxDetails}): ${errorMessage(revParseError, "rev-parse failed")}`,
            );
            return null;
          })
      : Promise.resolve(null);

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
          { refreshBase: true },
        ),
    );
    completedSteps.push({
      type: "tool",
      label: "Syncing repository refs...",
      status: "complete",
    });
    const bakedSha = await bakedShaPromise;

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

    if (prepared.usedSnapshot && profile.runsServices) {
      await emitSessionProgress(
        ctx,
        args.sessionId,
        completedSteps,
        "Updating dependencies...",
      );
      let drift = { node: true, python: true };
      if (bakedSha) {
        drift = await runLoggedSessionStep(
          "newSessionSandbox.checkLockfileDrift",
          sandboxDetails,
          () => lockfileDrifted(handle, rootDir, bakedSha),
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

    if (!args.hasLinkedRepos) {
      await ctx.runMutation(internal.sessions.clearSandboxSetupPending, {
        sessionId: args.sessionId,
      });
    }

    if (!profile.runsServices) {
      await completeSessionProgress(ctx, args.sessionId);
      logSession(
        `prepareSessionSandboxInternal summary: elapsed=${formatDurationMsShort(Date.now() - startedAt)}, path=new-coordinator, isNew=true, usedSnapshot=${prepared.usedSnapshot} (${sandboxDetails})`,
      );
      return {
        sandbox: handle,
        isNew: true,
        usedSnapshot: prepared.usedSnapshot,
        sandboxDetails,
        branchName: args.branchName,
        devPort: undefined,
        devCommand: undefined,
        resumeFellBack: reuseId !== undefined,
      };
    }

    await emitSessionProgress(
      ctx,
      args.sessionId,
      completedSteps,
      "Starting dev server...",
    );
    await prepared.dockerReady;
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
        force: prepared.usedSnapshot ? true : undefined,
      },
    );
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
            sandboxOwnerKey({ kind: "session", sessionId: args.sessionId }),
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
            sandboxOwnerKey({ kind: "session", sessionId: args.sessionId }),
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
    /** Fences ready / failure writes to this start; see `_sandbox/transitions.ts`. */
    startAttempt: v.optional(v.number()),
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
        startAttempt: args.startAttempt,
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
            startAttempt: args.startAttempt,
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
        // Superseded, not stopped: the newer start is using this VM.
        const superseded = isSupersededStart(
          (
            await ctx.runQuery(internal.sessions.getInternal, {
              id: args.sessionId,
            })
          )?.sandboxStartAttempt,
          args.startAttempt,
        );
        if (args.repoId && stopId && !superseded) {
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
      // A newer start took over (Start pressed again) and may be resuming
      // this same VM: stopping it here would kill that start mid-resume.
      // `sandboxError` below ignores this stale attempt anyway.
      const superseded = isSupersededStart(
        sessionAfter?.sandboxStartAttempt,
        args.startAttempt,
      );
      // No early-ready — stop any id we were asked to reuse and mark closed.
      if (args.repoId && stopId && !superseded) {
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
        startAttempt: args.startAttempt,
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
