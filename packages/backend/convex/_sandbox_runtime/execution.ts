"use node";

import { ConvexError, v, type Infer } from "convex/values";
import { quote } from "shell-quote";
import { DESKTOP_PORT, EDITOR_PORT, previewProxyPort } from "@eva/shared";
import { redactSecrets } from "@eva/shared/redactSecrets";
import { SandboxProviderError, type SandboxHandle } from "../_sandbox/provider";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  getAIModelProvider,
  normalizeAIModel,
  reasoningLevelValidator,
  turnEntityIdValidator,
  usesChatDaemon,
} from "../validators";
import {
  execHandle,
  resolveSandboxContext,
  getRunningSandboxHandle,
  getSandboxHandle,
  ensureSandboxRunning,
  ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS,
  errorMessage,
  signAndLaunchScript,
  KILL_PRIOR_AGENT_PROCESSES_CMD,
  PREFER_OOM_KILL_LINE,
  sessionClaudeUuid,
  restartUnresponsiveSandbox,
} from "./helpers";
import { writeSandboxFile } from "./sandboxFiles";
import { computeStartupFingerprint } from "../_evaConfig/config";
import {
  readBranchAppCommands,
  readStartupMarker,
  startupMarkerMatches,
  writeStartupMarker,
} from "./startupMarker";
import { pollPreviewReadiness } from "./previewPoll";
import { CALLBACK_SCRIPT_FINGERPRINT } from "./callbackScriptFingerprint";
import {
  buildDaemonAliveCheckCmd,
  buildKillEntityDaemonCmd,
  entityDaemonPaths,
  SESSION_DAEMON_MUTATIONS,
} from "./daemonPaths";
import { uploadCallbackScriptBundle } from "./launch";
import {
  materializeAttachmentsToSandbox,
  buildAttachmentPromptNote,
} from "./attachments";
import { resolveProviderAccountCredentialRevision } from "../envVarResolver";
import {
  buildConvexBackgroundScriptBody,
  isConvexBackendCommand,
  CONVEX_FUNCTIONS_READY_LOG_LINE,
} from "./convexLocalBackend";
import { ensureSwapFile } from "./swap";
import { restoreSeededRuntimeState as restoreSeededRuntimeStateInSandbox } from "./devServer";
import { isSandboxNetworkIssue } from "../_sandbox/networkIssue";
import { assertActionSandboxAccess } from "../functions";
import { sandboxGitTargetValidator } from "../sandboxGit";
import {
  isSandboxGoneError,
  isSandboxUnresponsiveError,
} from "./sandboxErrors";
import {
  shouldDeferDaemonRespawn,
  type DaemonTurnSnapshot,
} from "../_chat/daemonClaimPause";
import { isSandboxClosingStatus } from "../_sandbox/closingStatus";
import { buildPortListenProbeCommand } from "./httpReadyProbe";
import type { ProgressStep } from "./startupProgress";

async function probePreviewReady(
  handle: SandboxHandle,
  port: number,
): Promise<boolean> {
  try {
    const listening = (
      await execHandle(handle, buildPortListenProbeCommand(port), 5)
    ).trim();
    if (listening === "yes") return true;

    const result = await execHandle(
      handle,
      `curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:${port}`,
      5,
    );
    const code = parseInt(result.trim() || "0", 10);
    return code >= 200 && code < 500;
  } catch {
    return false;
  }
}
import {
  fetchOrigin,
  setupBranch,
  checkoutFetchedBaseBranch,
  createSandboxAndPrepareRepo,
  getOrCreateSandbox,
  isTransientTransportError,
  pushBranchToOrigin,
  commitAndPushCheckedOutBranch,
  writeAutoPublishPolicy,
  EPHEMERAL_LIFECYCLE,
  SESSION_LIFECYCLE,
} from "./git";
import { deleteSandboxAndCredentials } from "./gitCredentials";
import {
  ensurePreviewNavigationProxy,
  PREVIEW_TAB_PREFIX,
  VERCEL_PREVIEW_PROXY_PORT,
  VERCEL_DESKTOP_INTERNAL_PORT,
  VERCEL_EDITOR_INTERNAL_PORT,
} from "./previewProxy";
import { vercelAppListenPort } from "./vercelAppPorts";
import {
  getPreviewGrantPublicJwk,
  previewSessionSecret,
  signPreviewGrant,
} from "../previewGrant";
import { PREVIEW_GRANT_PARAM } from "../previewGrantConfig";
import { createHash, createHmac } from "node:crypto";
import { chatSystemPrompt } from "../_sessions/prompts";
import { previewActivityHmacMessage } from "./callbackAuth";
import { resolvePublicConvexSiteUrl } from "../_env/publicConvexUrls";
import { tryGetEvaBaseUrl } from "../_env/webAppUrl";
import { sleep } from "../_shared/async";

function previewActivityParams(sandboxId: string): {
  activityUrl: string;
  activityHmac: string;
} {
  const secret = process.env.ENCRYPTION_KEY;
  const siteUrl = resolvePublicConvexSiteUrl(process.env);
  if (!secret || !siteUrl) return { activityUrl: "", activityHmac: "" };
  return {
    activityUrl: `${siteUrl}/api/preview/activity`,
    activityHmac: createHmac("sha256", secret)
      .update(previewActivityHmacMessage(sandboxId))
      .digest("hex"),
  };
}

const sessionPersistenceIdValidator = v.union(
  v.id("sessionChats"),
  v.id("sessions"),
  v.id("projects"),
  v.id("agentTasks"),
);

const PREWARM_LAUNCH_LEASE_WAIT_MS = 90_000;
const PREWARM_LAUNCH_LEASE_POLL_MS = 500;

/** Checks whether a sandbox is healthy, starting it if stopped. */
export const validateSandbox = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    skipDocker: v.optional(v.boolean()),
  },
  returns: v.object({ healthy: v.boolean() }),
  handler: async (ctx, args) => {
    let sandbox: SandboxHandle | undefined;
    try {
      sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      await ensureSandboxRunning(sandbox, {
        timeoutSeconds: ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS,
        skipDocker: args.skipDocker,
      });
      return { healthy: true };
    } catch (e) {
      if (sandbox !== undefined && isSandboxUnresponsiveError(e)) {
        console.warn(
          `[sandbox] validateSandbox: sandbox ${args.sandboxId} is unresponsive (${errorMessage(e, "exec failed")}); attempting stop+resume`,
        );
        try {
          await restartUnresponsiveSandbox(sandbox);
          return { healthy: true };
        } catch (restartError) {
          console.warn(
            `[sandbox] validateSandbox: stop+resume failed for ${args.sandboxId}: ${errorMessage(restartError, "restart failed")}; reporting unhealthy`,
          );
          return { healthy: false };
        }
      }
      console.error("Sandbox validation failed:", e);
      return { healthy: false };
    }
  },
});

async function resolveStartupCommands(
  ctx: ActionCtx,
  sandbox: SandboxHandle,
  repoId: Id<"githubRepos">,
): Promise<string[]> {
  const cached = await ctx.runQuery(internal.repoSnapshots.getAppRunCommands, {
    repoId,
  });
  if (!cached) return [];
  const branch = await readBranchAppCommands(sandbox, cached.rootDirectory);
  return branch?.startup ?? cached.startupCommands;
}

/**
 * Returns whether this sandbox already ran its current startup commands: the
 * marker exists and carries their fingerprint (a seeded snapshot built from
 * other commands, or a branch that edited them, does not count).
 */
export const startupCommandsMarkerExists = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const commands = await resolveStartupCommands(ctx, handle, args.repoId);
    return startupMarkerMatches(
      await readStartupMarker(handle),
      computeStartupFingerprint(commands),
    );
  },
});

/** Restores service state exported into a seeded snapshot before services boot. */
export const restoreSeededRuntimeState = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    await restoreSeededRuntimeStateInSandbox(sandbox);
    return null;
  },
});

/**
 * Runs startup commands on a sandbox if configured. Exported for DIRECT calls
 * from sibling "use node" actions (sessions/tasks/projects startup): nesting it
 * via ctx.runAction dies after ~300s in Convex's runAction syscall bridge with
 * a message-less Error whenever a readiness gate legitimately waits longer —
 * the recurring "Sandbox startup unfinished" with no detail.
 */
export async function runStartupCommandsDirect(
  ctx: ActionCtx,
  args: { sandboxId: string; repoId: Id<"githubRepos">; force?: boolean },
): Promise<{ ran: boolean; commandCount: number; errors: string[] }> {
  const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
  const commands = await resolveStartupCommands(ctx, sandbox, args.repoId);

  if (commands.length === 0) {
    return { ran: false, commandCount: 0, errors: [] };
  }

  const fingerprint = computeStartupFingerprint(commands);
  if (!args.force) {
    if (startupMarkerMatches(await readStartupMarker(sandbox), fingerprint)) {
      console.log(
        `[sandbox] runStartupCommands: marker matches, skipping ${commands.length} commands`,
      );
      return { ran: false, commandCount: 0, errors: [] };
    }
  }

  console.log(
    `[sandbox] runStartupCommands: executing ${commands.length} startup command(s)${args.force ? " (forced)" : ""}`,
  );

  const errors: string[] = [];
  for (const command of commands) {
    const shown = redactSecrets(command);
    console.log(`[sandbox] runStartupCommands: running: ${shown}`);
    try {
      const output = await execHandle(sandbox, command, 600);
      console.log(`[sandbox] runStartupCommands: completed: ${shown}`);
      if (output.trim()) {
        console.log(`[sandbox] output: ${redactSecrets(output.slice(0, 500))}`);
      }
    } catch (e) {
      const msg = errorMessage(e, "command failed");
      console.error(`[sandbox] runStartupCommands: failed: ${shown}`, msg);
      errors.push(`${shown}: ${msg}`);
    }
  }

  if (errors.length === 0) {
    try {
      await writeStartupMarker(sandbox, fingerprint);
    } catch {
    }
  } else {
    console.error(
      `[sandbox] runStartupCommands: ${errors.length}/${commands.length} command(s) failed — NOT writing marker so the next resume retries`,
    );
  }

  return { ran: true, commandCount: commands.length, errors };
}

/**
 * Action wrapper for {@link runStartupCommandsDirect} — for workflow steps and
 * scheduler calls only. Do NOT ctx.runAction this from another action (see
 * the ~300s nested-runAction ceiling note above); call the helper directly.
 */
export const runStartupCommands = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    ran: v.boolean(),
    commandCount: v.number(),
    errors: v.array(v.string()),
  }),
  handler: (ctx, args) => runStartupCommandsDirect(ctx, args),
});

async function classifyBackgroundLaunchFailure(
  sandbox: SandboxHandle,
  error: unknown,
): Promise<"command-failed" | "unresponsive" | "not-running"> {
  const directSignal = isSandboxUnresponsiveError(error);
  const providerBadRequest =
    error instanceof SandboxProviderError && error.httpStatus === 400;
  if (!directSignal && !providerBadRequest) return "command-failed";

  try {
    await sandbox.refresh();
  } catch {
    return "not-running";
  }
  if (sandbox.state !== "running") return "not-running";
  if (directSignal) return "unresponsive";
  try {
    await execHandle(sandbox, "echo 1", 5);
    return "command-failed";
  } catch {
    return "unresponsive";
  }
}

const ownedBgPidLines = (i: number): string[] => [
  `pid=$(cat /tmp/bg-${i}.pid 2>/dev/null || true)`,
  `if [ -n "$pid" ] && ! tr '\\0' ' ' < /proc/"$pid"/cmdline 2>/dev/null | grep -qF "/tmp/bg-cmd-${i}.sh"; then pid=; fi`,
];

/**
 * Launches background commands (long-running daemons like `npx convex dev`) on
 * a sandbox. Each command is detached via `nohup ... > /tmp/bg-<idx>.log 2>&1 &`
 * so the shell forks immediately without waiting for the daemon to exit.
 *
 * Unlike `runStartupCommands`, there is **no marker file** — daemons die when
 * the sandbox stops, so we always re-run on resume to respawn them. Mirrors
 * the dev-server launch idiom used elsewhere in this file.
 */
export const runBackgroundCommands = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    onlyRestartDead: v.optional(v.boolean()),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.object({
    ran: v.boolean(),
    commandCount: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ran: boolean; commandCount: number; errors: string[] }> => {
    const cached = await ctx.runQuery(
      internal.repoSnapshots.getAppRunCommands,
      { repoId: args.repoId },
    );
    if (!cached) return { ran: false, commandCount: 0, errors: [] };

    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const branch = await readBranchAppCommands(sandbox, cached.rootDirectory);
    const commands = branch?.background ?? cached.backgroundCommands;

    if (commands.length === 0) {
      return { ran: false, commandCount: 0, errors: [] };
    }

    console.log(
      `[sandbox] runBackgroundCommands: launching ${commands.length} background command(s)${args.onlyRestartDead ? " (onlyRestartDead)" : ""}`,
    );

    await ensureSwapFile(sandbox);

    const errors: string[] = [];
    let launched = 0;
    let launchedConvex = false;
    let restartAttempted = false;
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const shown = redactSecrets(command);
      const isConvexCommand = isConvexBackendCommand(command);
      try {
        if (args.onlyRestartDead) {
          const alive = (
            await execHandle(
              sandbox,
              [
                ...ownedBgPidLines(i),
                `if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then echo dead; exit 0; fi`,
                `state=$(awk '{print $3}' /proc/"$pid"/stat 2>/dev/null || echo Z)`,
                `if [ "$state" = "Z" ]; then echo dead; else echo alive; fi`,
              ].join("; "),
              5,
            )
          ).trim();
          if (alive === "alive") {
            console.log(
              `[sandbox] runBackgroundCommands: still alive, skip: ${shown}`,
            );
            continue;
          }
        }
        const cleanup = [
          ...ownedBgPidLines(i),
          `if [ -n "$pid" ]; then kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true`,
          `for _ in 1 2 3 4; do kill -0 -- -"$pid" 2>/dev/null || kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done`,
          `kill -KILL -- -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; fi`,
          `rm -f /tmp/bg-${i}.pid`,
        ];
        if (isConvexCommand) {
          cleanup.push(
            `pkill -TERM -f '[c]onvex-local-backend' 2>/dev/null || true`,
            `pkill -TERM -f '[c]onvex dev' 2>/dev/null || true`,
            `sleep 1`,
            `pkill -KILL -f '[c]onvex-local-backend' 2>/dev/null || true`,
            `pkill -KILL -f '[c]onvex dev' 2>/dev/null || true`,
          );
        }
        cleanup.push("true");
        await execHandle(sandbox, cleanup.join("; "), 15);
        const logPath = `/tmp/bg-${i}.log`;
        const scriptPath = `/tmp/bg-cmd-${i}.sh`;
        const scriptBody = `${PREFER_OOM_KILL_LINE}\n${
          isConvexCommand ? buildConvexBackgroundScriptBody(command) : command
        }`;
        console.log(
          `[sandbox] runBackgroundCommands: launching: ${shown} (log: ${logPath})`,
        );
        await writeSandboxFile(sandbox, scriptPath, scriptBody, {
          executable: true,
        });
        const launchCmd = `(setsid nohup bash -l ${scriptPath} </dev/null > ${logPath} 2>&1 & echo $! > /tmp/bg-${i}.pid) && echo LAUNCHED`;
        await execHandle(sandbox, launchCmd, 10);
        launched += 1;
        if (isConvexCommand) launchedConvex = true;
      } catch (e) {
        const verdict = await classifyBackgroundLaunchFailure(sandbox, e);
        if (
          verdict === "unresponsive" &&
          !args.onlyRestartDead &&
          !restartAttempted
        ) {
          restartAttempted = true;
          console.warn(
            `[sandbox] runBackgroundCommands: sandbox ${args.sandboxId} is unresponsive (${errorMessage(e, "exec failed")}); attempting stop+resume`,
          );
          try {
            await restartUnresponsiveSandbox(sandbox);
            errors.length = 0;
            launched = 0;
            launchedConvex = false;
            i = -1;
            continue;
          } catch (restartError) {
            console.warn(
              `[sandbox] runBackgroundCommands: stop+resume failed for ${args.sandboxId}: ${errorMessage(restartError, "restart failed")}`,
            );
          }
        }
        const msg = errorMessage(e, "command failed");
        console.error(
          `[sandbox] runBackgroundCommands: failed to launch: ${shown}`,
          msg,
        );
        errors.push(`${shown}: ${msg}`);
        if (verdict !== "command-failed") {
          const remaining = commands.length - i - 1;
          if (remaining > 0) {
            errors.push(
              `${remaining} command(s) skipped: sandbox ${verdict === "unresponsive" ? "unresponsive" : "not running"}`,
            );
          }
          console.warn(
            `[sandbox] runBackgroundCommands: aborting launches on ${args.sandboxId} (${verdict}); ${remaining} command(s) skipped`,
          );
          break;
        }
      }
    }

    if (launchedConvex) {
      const sessionId = args.sessionId;
      if (!(await sandboxStillWanted(ctx, args.sandboxId, sessionId))) {
        console.log(
          `[sandbox] runBackgroundCommands: skipping Convex readiness watch, sandbox stopped ${args.sandboxId}`,
        );
      } else {
        await ctx.scheduler.runAfter(0, internal.sandbox.watchConvexReadiness, {
          sandboxId: args.sandboxId,
          repoId: args.repoId,
          ...(sessionId === undefined ? {} : { sessionId }),
        });
      }
    }

    return {
      ran: launched > 0 || !args.onlyRestartDead,
      commandCount: launched,
      errors,
    };
  },
});

const CONVEX_READY_POLL_INTERVAL_MS = 10_000;
const CONVEX_READY_TIMEOUT_MS = 360_000;

/**
 * False once Eva has stopped the VM: the session is no longer active or no
 * longer owns it, or (no session) every owner is stopping or closed. Any exec
 * after that resumes the stopped VM (Vercel SDK `withResume`) and bills it.
 */
export async function sandboxStillWanted(
  ctx: ActionCtx,
  sandboxId: string,
  sessionId: Id<"sessions"> | undefined,
): Promise<boolean> {
  if (sessionId === undefined) {
    const state = await ctx.runQuery(
      internal.sandboxIdlePause.getSandboxOwnerState,
      { sandboxId },
    );
    return state !== "stopping" && state !== "closed";
  }
  const session = await ctx.runQuery(internal.sessions.getInternal, {
    id: sessionId,
  });
  return (
    session !== null &&
    session.status === "active" &&
    session.sandboxId === sandboxId
  );
}

/**
 * Fire-and-forget watcher for Convex background daemons. Polls each Convex
 * `/tmp/bg-<i>.log` for the CLI's ready line with short execs (each its own
 * HTTP call, so no per-exec ceiling applies), then either logs success or
 * surfaces a non-fatal session warning with the daemon log tail.
 */
export const watchConvexReadiness = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const commands: string[] | null = await ctx.runQuery(
      internal.repoSnapshots.getBackgroundCommands,
      { repoId: args.repoId },
    );
    const convexIndexes = (commands ?? [])
      .map((command, i) => (isConvexBackendCommand(command) ? i : -1))
      .filter((i) => i >= 0);
    if (convexIndexes.length === 0) return null;

    const sessionId = args.sessionId;
    if (!(await sandboxStillWanted(ctx, args.sandboxId, sessionId))) {
      console.log(
        `[sandbox] watchConvexReadiness: aborted, sandbox stopped ${args.sandboxId}`,
      );
      return null;
    }

    let sandbox: SandboxHandle;
    try {
      sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    } catch (e) {
      if (isSandboxGoneError(e)) {
        console.log(
          `[sandbox] watchConvexReadiness: sandbox gone, stopping (${args.sandboxId})`,
        );
        return null;
      }
      throw e;
    }
    const logPaths = convexIndexes.map((i) => `/tmp/bg-${i}.log`);
    const probeCmd = [
      "ok=yes",
      ...logPaths.map(
        (p) =>
          `grep -q "${CONVEX_FUNCTIONS_READY_LOG_LINE}" ${p} 2>/dev/null || ok=no`,
      ),
      "echo $ok",
    ].join("; ");

    const startedAt = Date.now();
    while (Date.now() - startedAt < CONVEX_READY_TIMEOUT_MS) {
      if (!(await sandboxStillWanted(ctx, args.sandboxId, sessionId))) {
        console.log(
          `[sandbox] watchConvexReadiness: aborted, sandbox stopped ${args.sandboxId}`,
        );
        return null;
      }
      try {
        const result = (await execHandle(sandbox, probeCmd, 10)).trim();
        if (result === "yes") {
          console.log(
            `[sandbox] watchConvexReadiness: ready after ${Math.round((Date.now() - startedAt) / 1000)}s (${args.sandboxId})`,
          );
          return null;
        }
      } catch (e) {
        if (isSandboxGoneError(e)) {
          console.log(
            `[sandbox] watchConvexReadiness: sandbox gone, stopping (${args.sandboxId})`,
          );
          return null;
        }
        console.log(
          `[sandbox] watchConvexReadiness: probe failed, retrying: ${errorMessage(e, "probe failed")}`,
        );
      }
      await sleep(CONVEX_READY_POLL_INTERVAL_MS);
    }

    if (!(await sandboxStillWanted(ctx, args.sandboxId, sessionId))) {
      console.log(
        `[sandbox] watchConvexReadiness: timed out after stop, not warning (${args.sandboxId})`,
      );
      return null;
    }

    let logTail = "";
    try {
      logTail = await execHandle(
        sandbox,
        logPaths
          .map((p) => `echo "== ${p} =="; tail -n 40 ${p} 2>/dev/null`)
          .join("; "),
        10,
      );
    } catch {
    }
    const detail =
      `Convex dev was not ready after ${Math.round(CONVEX_READY_TIMEOUT_MS / 60000)} minutes.\n${redactSecrets(logTail)}`.slice(
        0,
        4000,
      );
    console.error(
      `[sandbox] watchConvexReadiness: timed out (${args.sandboxId}): ${detail}`,
    );
    if (sessionId !== undefined) {
      await ctx.runMutation(internal.sessions.sandboxStartupWarning, {
        sessionId,
        error: detail,
      });
    }
    return null;
  },
});

const previewUrlArgs = {
  sandboxId: v.string(),
  port: v.number(),
  checkReady: v.optional(v.boolean()),
  navigationSync: v.optional(v.boolean()),
  customTabPort: v.optional(v.number()),
  repoId: v.id("githubRepos"),
};

const previewUrlResult = v.object({
  url: v.string(),
  port: v.number(),
  ready: v.boolean(),
});

interface PreviewUrlRequest {
  sandboxId: string;
  port: number;
  checkReady?: boolean;
  navigationSync?: boolean;
  customTabPort?: number;
  repoId: Id<"githubRepos">;
}

async function buildPreviewUrl(
  ctx: ActionCtx,
  args: PreviewUrlRequest,
  subject: string,
): Promise<{ url: string; port: number; ready: boolean }> {
  const customTabPort = args.customTabPort;
  if (customTabPort !== undefined) {
    const reserved =
      customTabPort === VERCEL_PREVIEW_PROXY_PORT ||
      customTabPort === DESKTOP_PORT ||
      customTabPort === EDITOR_PORT;
    if (
      !Number.isInteger(customTabPort) ||
      customTabPort <= 0 ||
      customTabPort > 65535 ||
      reserved
    ) {
      throw new Error(
        `Invalid custom tab port: ${customTabPort} (must be 1-65535 and not a reserved proxy port ${VERCEL_PREVIEW_PROXY_PORT}/${DESKTOP_PORT}/${EDITOR_PORT})`,
      );
    }
  }
  const responsePort = customTabPort ?? args.port;

  const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

  const upstreamPort =
    args.port === DESKTOP_PORT
      ? VERCEL_DESKTOP_INTERNAL_PORT
      : args.port === EDITOR_PORT
        ? VERCEL_EDITOR_INTERNAL_PORT
        : vercelAppListenPort(args.port);

  let ready = true;
  if (args.checkReady) {
    const poll = await pollPreviewReadiness(
      {
        sandboxRunning: handle.state === "running",
        customTabPort,
        port: args.port,
      },
      {
        claimHeal: () =>
          ctx.runMutation(internal.sandboxHeal.claim, {
            sandboxId: args.sandboxId,
          }),
        healBackgroundCommands: async () => {
          await ctx.runAction(internal.sandbox.runBackgroundCommands, {
            sandboxId: args.sandboxId,
            repoId: args.repoId,
            onlyRestartDead: true,
          });
        },
        probeReady: () =>
          probePreviewReady(handle, customTabPort ?? upstreamPort),
        scheduleRecovery: async () => {
          await ctx.scheduler.runAfter(
            0,
            internal.sandbox.ensureSessionPreviewServices,
            {
              sandboxId: args.sandboxId,
              repoId: args.repoId,
              expectedPort: upstreamPort,
            },
          );
        },
        onHealFailed: (e) =>
          console.warn(
            `[sandbox] preview background heal failed sandbox=${args.sandboxId}: ${errorMessage(e, "heal failed")}`,
          ),
      },
    );
    if (poll.kind === "sandbox-not-running") {
      return { url: "", port: responsePort, ready: false };
    }
    ready = poll.ready;
  } else if (customTabPort === undefined && handle.state === "running") {
    await ctx.scheduler.runAfter(
      0,
      internal.sandbox.ensureSessionPreviewServices,
      {
        sandboxId: args.sandboxId,
        repoId: args.repoId,
        expectedPort: upstreamPort,
      },
    );
  }

  const previewPublicJwk = getPreviewGrantPublicJwk();
  const fixedVercelProxyPort = previewProxyPort(args.port);
  let previewPort = fixedVercelProxyPort;
  const proxyTargetPort = upstreamPort;
  const proxyUsable =
    customTabPort === undefined ? ready : handle.state === "running";
  if (proxyUsable) {
    try {
      previewPort = await ensurePreviewNavigationProxy(
        handle,
        proxyTargetPort,
        {
          publicKeyJwk: previewPublicJwk,
          sandboxId: args.sandboxId,
          repoId: args.repoId,
          webAppUrl: tryGetEvaBaseUrl() ?? "",
          inject: args.navigationSync === true,
          authPort: fixedVercelProxyPort,
          sessionSecret: previewSessionSecret(
            args.sandboxId,
            fixedVercelProxyPort,
          ),
          ...previewActivityParams(args.sandboxId),
        },
        fixedVercelProxyPort,
      );
    } catch (e) {
      const proxyErrorMessage = errorMessage(e, "proxy startup failed");
      console.warn(
        `[sandbox] preview navigation proxy unavailable for sandbox=${args.sandboxId} port=${args.port}: ${proxyErrorMessage}`,
      );
      if (previewPublicJwk) {
        throw new Error(
          `Vercel preview proxy failed to start on port ${fixedVercelProxyPort}: ${proxyErrorMessage}`,
        );
      }
    }
  }

  const signedPreview = await handle.previewUrl(previewPort, 86400);
  const parsedUrl = new URL(signedPreview.url);
  parsedUrl.protocol = "https:";

  if (previewPublicJwk && proxyUsable) {
    const grant = await signPreviewGrant({
      sandboxId: args.sandboxId,
      port: fixedVercelProxyPort,
      sub: subject,
    });
    parsedUrl.searchParams.set(PREVIEW_GRANT_PARAM, grant);
  }

  if (customTabPort !== undefined) {
    parsedUrl.pathname = `${PREVIEW_TAB_PREFIX}/${customTabPort}/`;
  }

  const url = parsedUrl.toString();
  return { url, port: responsePort, ready };
}

/** Preview URL for the signed-in web app (Preview pane, open-in-new-tab). */
export const getPreviewUrl = action({
  args: previewUrlArgs,
  returns: previewUrlResult,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await assertActionSandboxAccess(ctx, args.repoId, args.sandboxId);
    return await buildPreviewUrl(ctx, args, identity.subject);
  },
});

/**
 * Preview URL for a caller whose access has already been established — the MCP
 * `get_preview_url` tool, which resolves the chat as its user and so reads the
 * sandbox id off a document that user can see. There is no identity on an
 * internal action, so the caller must not reach this with an unchecked id.
 */
export const previewUrlForAuthorizedSandbox = internalAction({
  args: { ...previewUrlArgs, clerkUserId: v.string() },
  returns: previewUrlResult,
  handler: async (ctx, { clerkUserId, ...args }) =>
    await buildPreviewUrl(ctx, args, clerkUserId),
});

const MAX_SETUP_ELAPSED_MS = 8 * 60 * 1000;

function isSandboxSetupRetryable(message: string): boolean {
  return (
    isSandboxNetworkIssue(message) ||
    isTransientTransportError(message) ||
    message.toLowerCase().includes("sandbox command failed with exit code -1")
  );
}

/** Creates or resumes a sandbox without performing repo sync. */
export const createOrResumeSandbox = internalAction({
  args: {
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    ephemeral: v.optional(v.boolean()),
    repoId: v.id("githubRepos"),
    streamingEntityId: v.optional(v.string()),
  },
  returns: v.object({
    sandboxId: v.string(),
    resumeFellBack: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const completedSteps: ProgressStep[] = [];
    const emitProgress = async (label: string): Promise<void> => {
      if (!args.streamingEntityId) return;
      const steps: ProgressStep[] = [
        ...completedSteps,
        { type: "tool", label, status: "active" },
      ];
      await ctx.runMutation(internal.streaming.internalSet, {
        entityId: args.streamingEntityId,
        currentActivity: JSON.stringify(steps),
      });
      completedSteps.push({ type: "tool", label, status: "complete" });
    };

    const setupStartedAt = Date.now();
    console.log(
      `[sandbox] createOrResumeSandbox: resolving context for repo=${args.repoOwner}/${args.repoName} repoId=${args.repoId} ephemeral=${args.ephemeral ?? false}`,
    );
    const { client, sandboxEnvVars, snapshotName } =
      await resolveSandboxContext(ctx, args.repoId);
    const existingSandboxId = args.existingSandboxId;
    console.log(
      `[sandbox] createOrResumeSandbox: context resolved in ${Date.now() - setupStartedAt}ms — snapshot=${snapshotName ?? "none"}, existingSandbox=${existingSandboxId ?? "none"}`,
    );

    let sandbox: SandboxHandle | undefined;
    let resumeFellBack = false;
    let deleteSandboxOnFailure = false;
    let attempt = 1;
    const maxSetupAttempts = 3;
    while (true) {
      try {
        if (args.ephemeral) {
          const prepared = await createSandboxAndPrepareRepo(
            ctx,
            client,
            args.installationId,
            args.repoOwner,
            args.repoName,
            sandboxEnvVars,
            EPHEMERAL_LIFECYCLE,
            snapshotName,
            undefined,
            emitProgress,
            { mode: "none" },
          );
          sandbox = prepared.sandbox;
          deleteSandboxOnFailure = true;
          resumeFellBack = false;
        } else {
          const prepared = await getOrCreateSandbox(
            ctx,
            client,
            existingSandboxId,
            args.installationId,
            args.repoOwner,
            args.repoName,
            sandboxEnvVars,
            SESSION_LIFECYCLE,
            snapshotName,
            emitProgress,
            { mode: "none" },
          );
          sandbox = prepared.sandbox;
          deleteSandboxOnFailure = prepared.isNew;
          resumeFellBack = prepared.resumeFellBack;
        }

        break;
      } catch (error) {
        if (deleteSandboxOnFailure && sandbox) {
          console.warn(
            `[sandbox] createOrResumeSandbox: deleting failed sandbox ${sandbox.id}`,
          );
          await deleteSandboxAndCredentials(ctx, sandbox);
        }

        const message = errorMessage(error, "Sandbox setup failed");
        const elapsed = Date.now() - setupStartedAt;
        const retryable = isSandboxSetupRetryable(message);
        const withinTimeLimit = elapsed < MAX_SETUP_ELAPSED_MS;
        const shouldRetry = retryable && withinTimeLimit;

        console.warn(
          `[sandbox] createOrResumeSandbox: attempt ${attempt}/${maxSetupAttempts} failed after ${elapsed}ms — retryable=${retryable}, withinTimeLimit=${withinTimeLimit}, shouldRetry=${shouldRetry}: ${message}`,
        );

        if (!shouldRetry || attempt >= maxSetupAttempts) {
          console.error(
            `[sandbox] createOrResumeSandbox: giving up after ${attempt} attempt(s), total elapsed=${elapsed}ms: ${message}`,
          );
          throw error;
        }

        const delayMs =
          2500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
        console.warn(
          `[sandbox] createOrResumeSandbox: retrying in ${delayMs}ms`,
        );
        await sleep(delayMs);
        completedSteps.length = 0;
        await emitProgress("Retrying sandbox setup...");
        attempt += 1;
        sandbox = undefined;
        deleteSandboxOnFailure = false;
      }
    }

    if (!sandbox) {
      throw new Error("Sandbox setup failed");
    }

    const totalElapsed = Date.now() - setupStartedAt;
    console.log(
      `[sandbox] createOrResumeSandbox: success in ${totalElapsed}ms, sandboxId=${sandbox.id}, attempts=${attempt}`,
    );
    return {
      sandboxId: sandbox.id,
      resumeFellBack,
    };
  },
});

/** Fetches a base branch from the remote origin into the sandbox. */
export const fetchBaseBranch = internalAction({
  args: {
    sandboxId: v.string(),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const result = await fetchOrigin(
      sandbox,
      args.repoOwner,
      args.repoName,
      args.baseBranch,
      {
        prune: false,
        timeoutSeconds: 120,
        retryAttempts: 2,
      },
    );
    if (!result.fetched) {
      console.warn(
        `[sandbox] fetchBaseBranch: remote ref ${args.baseBranch} is gone; continuing with local snapshot refs`,
      );
    }
    return null;
  },
});

/** Checks out a previously fetched base branch in the sandbox. */
export const checkoutBaseBranch = internalAction({
  args: {
    sandboxId: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    await checkoutFetchedBaseBranch(sandbox, args.baseBranch);
    return null;
  },
});

/** Configures the GitHub origin and sets up a working branch in the sandbox. */
export const setupSandboxBranch = internalAction({
  args: {
    sandboxId: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    await setupBranch(sandbox, args.branchName, args.baseBranch);
    return null;
  },
});

/** Publishes the sandbox's current local branch using a fresh GitHub App token. */
export const pushSandboxBranch = internalAction({
  args: {
    sandboxId: v.string(),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.object({ pushed: v.boolean(), published: v.boolean() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ pushed: boolean; published: boolean }> => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    try {
      return await pushBranchToOrigin(
        sandbox,
        args.repoOwner,
        args.repoName,
        args.branchName,
        { timeoutSeconds: 90, retryAttempts: 3 },
      );
    } catch (error) {
      console.error(
        `[sandbox][execution] pushSandboxBranch failed sandbox=${args.sandboxId} repo=${args.repoOwner}/${args.repoName} branch=${args.branchName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  },
});

/** The sandbox's checked-out commit, e.g. the tip a push just published. */
export const readSandboxHead = internalAction({
  args: { sandboxId: v.string(), repoId: v.id("githubRepos") },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    return (await execHandle(sandbox, "git rev-parse HEAD", 15)).trim();
  },
});

/**
 * Per-turn auto-publish policy, written before the agent runs. With the
 * sender's `manualSideBranchPublish` flag on, only `branchName` (the chat
 * branch) is auto-committed and auto-pushed at turn end; side branches the
 * agent creates are left for it, or the user's "Commit & push", to publish.
 * Best-effort: a failed write keeps the previous turn's policy, never fails
 * the turn.
 */
export const applyBranchPublishPolicy = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    userId: v.id("users"),
    branchName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const [flags, sandbox] = await Promise.all([
        ctx.runQuery(internal.auth.getExperimentalFlagsInternal, {
          userId: args.userId,
        }),
        getSandboxHandle(ctx, args.repoId, args.sandboxId),
      ]);
      await writeAutoPublishPolicy(
        sandbox,
        flags.manualSideBranchPublish ? args.branchName : null,
      );
    } catch (error) {
      console.error(
        `[sandbox][execution] applyBranchPublishPolicy failed sandbox=${args.sandboxId} branch=${args.branchName}: ${errorMessage(error, "unknown error")}`,
      );
    }
    return null;
  },
});

/**
 * The branch chip's "Commit & push": commits the sandbox's uncommitted work on
 * the checked-out branch and pushes it, side branches included.
 */
export const commitAndPushSandbox = action({
  args: { target: sandboxGitTargetValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(
      internal.sandboxGit.getSandboxTargetInternal,
      { target: args.target },
    );
    if (target === null) throw new ConvexError("No sandbox for this chat");
    await assertActionSandboxAccess(ctx, target.repoId, target.sandboxId);
    const sandbox = await getSandboxHandle(ctx, target.repoId, target.sandboxId);
    let state: Awaited<ReturnType<typeof commitAndPushCheckedOutBranch>>;
    try {
      state = await commitAndPushCheckedOutBranch(
        sandbox,
        target.repoOwner,
        target.repoName,
      );
    } catch (error) {
      throw new ConvexError(errorMessage(error, "Couldn't push the branch"));
    }
    await ctx.runMutation(internal.sandboxGit.setSandboxGitStateInternal, {
      target: args.target,
      branch: state.branch,
      sync: state.sync,
    });
    return null;
  },
});

const pushLinkedRepoBranchResultValidator = v.object({
  sessionRepoId: v.id("sessionRepos"),
  pushed: v.boolean(),
  published: v.boolean(),
});

/**
 * Publishes every linked repo's branch that has commits origin lacks — the
 * multi-repo counterpart of `pushSandboxBranch`, one push per `sessionRepos`
 * row cloned into the same sandbox. Each row is independent: a missing clone
 * directory or a network failure on one repo is logged and reported as
 * `{ pushed: false, published: false }` rather than aborting the loop, so one
 * bad linked repo never strands a good push on its siblings.
 */
export const pushLinkedRepoBranches = internalAction({
  args: {
    sessionId: v.id("sessions"),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.array(pushLinkedRepoBranchResultValidator),
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      sessionRepoId: Id<"sessionRepos">;
      pushed: boolean;
      published: boolean;
    }>
  > => {
    const linkedRepos = await ctx.runQuery(
      internal.sessions.listLinkedReposInternal,
      { sessionId: args.sessionId },
    );
    if (linkedRepos.length === 0) return [];

    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const results: Array<{
      sessionRepoId: Id<"sessionRepos">;
      pushed: boolean;
      published: boolean;
    }> = [];

    for (const row of linkedRepos) {
      try {
        const quotedPath = quote([row.path]);
        const dirExists = (
          await execHandle(
            sandbox,
            `test -d ${quotedPath} && echo yes || echo no`,
            10,
          )
        ).trim();
        if (dirExists !== "yes") {
          console.warn(
            `[sandbox][execution] pushLinkedRepoBranches: ${row.path} is missing on sandbox=${args.sandboxId}, skipping (sessionRepoId=${row._id})`,
          );
          results.push({
            sessionRepoId: row._id,
            pushed: false,
            published: false,
          });
          continue;
        }

        await execHandle(
          sandbox,
          `cd ${quotedPath} && git config --unset-all http.https://github.com/.extraheader 2>/dev/null; git remote set-url origin ${quote([`https://github.com/${row.owner}/${row.name}.git`])} && GIT_TERMINAL_PROMPT=0 git fetch --no-tags origin ${quote([row.baseBranch])}`,
          120,
        );
        const rangeSpec = `origin/${row.baseBranch}..${row.branchName}`;
        const unpublishedCount = (
          await execHandle(
            sandbox,
            `cd ${quotedPath} && git rev-list --count ${quote([rangeSpec])}`,
            15,
          )
        ).trim();

        if (unpublishedCount === "0") {
          results.push({
            sessionRepoId: row._id,
            pushed: false,
            published: false,
          });
          continue;
        }

        const pushResult = await pushBranchToOrigin(
          sandbox,
          row.owner,
          row.name,
          row.branchName,
          { timeoutSeconds: 90, retryAttempts: 3, workspaceDir: row.path },
        );
        results.push({
          sessionRepoId: row._id,
          pushed: pushResult.pushed,
          published: pushResult.published,
        });
      } catch (error) {
        console.error(
          `[sandbox][execution] pushLinkedRepoBranches failed for sessionRepoId=${row._id} (${row.owner}/${row.name}): ${errorMessage(error, "push failed")}`,
        );
        results.push({
          sessionRepoId: row._id,
          pushed: false,
          published: false,
        });
      }
    }

    return results;
  },
});

type TraitEnvInput = {
  reasoningLevel?: string;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
};

function buildDaemonOptsSig(
  normalizedModel: string,
  allowedTools: string | undefined,
  providerAccountId: string | undefined,
  providerAccountCredentialRevision: number | undefined,
  streamingEntityId: string,
  traits: TraitEnvInput,
  systemPrompt: string | undefined,
): string {
  const fastMode =
    traits.fastMode === undefined ? "" : traits.fastMode ? "1" : "0";
  const systemPromptSig = systemPrompt
    ? createHash("sha256").update(systemPrompt).digest("hex").slice(0, 12)
    : "";
  return `${normalizedModel}|${allowedTools ?? ""}|${traits.reasoningLevel ?? ""}|${traits.thinkingEnabled === false ? "0" : ""}|${traits.use1mContext === true ? "1" : ""}|${fastMode}|${providerAccountId ?? ""}|${providerAccountCredentialRevision ?? ""}|${streamingEntityId}|${systemPromptSig}`;
}

function buildTraitEnvVars(traits: TraitEnvInput): Record<string, string> {
  const env: Record<string, string> = {};
  if (traits.reasoningLevel) {
    env.AI_REASONING_EFFORT = traits.reasoningLevel;
  }
  if (traits.thinkingEnabled === false) {
    env.AI_THINKING_ENABLED = "0";
  }
  if (traits.use1mContext === true) {
    env.AI_CONTEXT_1M = "1";
  }
  if (traits.fastMode !== undefined) {
    env.AI_FAST_MODE = traits.fastMode ? "1" : "0";
  }
  return env;
}

type PrewarmEntityDaemonBaseParams = {
  sandboxId: string;
  repoId: Id<"githubRepos">;
  userId: Id<"users">;
  entityId: string;
  entityIdField: string;
  completionMutation: string;
  claimMutation: string;
  openSyntheticTurnMutation: string;
  completeSyntheticTurnMutation: string;
  updateBackgroundAgentsMutation: string;
  updateGoalMutation?: string;
  model?: string;
  reasoningLevel?: Infer<typeof reasoningLevelValidator>;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
  allowedTools?: string;
  providerAccountId?: Id<"userProviderAccounts">;
  credentialOwnerUserId?: Id<"users">;
  sessionPersistenceId?: Infer<typeof sessionPersistenceIdValidator>;
  streamingEntityId?: string;
  skipPrewarm?: boolean;
};

type PrewarmEntityDaemonParams = PrewarmEntityDaemonBaseParams & {
  entityTable: "sessionChats";
};

async function runPrewarmEntityDaemon(
  ctx: ActionCtx,
  args: PrewarmEntityDaemonParams,
): Promise<{ prewarmed: boolean }> {
  const startedAt = Date.now();
  if (args.skipPrewarm === true) {
    return { prewarmed: false };
  }
  try {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const classification = await sandbox.classifyForReconcile();
    if (classification !== "alive") {
      console.log(
        `[sandbox][execution] prewarmEntityDaemon: sandbox ${args.sandboxId} classify=${classification} — skipping prewarm entityId=${args.entityId}`,
      );
      if (classification === "dead") {
        await ctx.runMutation(
          internal.sandboxDaemon.reconcileStoppedSandboxStatus,
          {
            entityTable: args.entityTable,
            entityId: args.entityId,
            sandboxId: args.sandboxId,
          },
        );
      }
      return { prewarmed: false };
    }
    const entityIdStr = args.entityId;
    const streamingEntityId = args.streamingEntityId ?? entityIdStr;
    const fp = CALLBACK_SCRIPT_FINGERPRINT;
    const normalizedModel = normalizeAIModel(args.model);
    if (!usesChatDaemon(normalizedModel)) {
      console.log(
        `[sandbox][execution] prewarmEntityDaemon: skip one-shot provider entityId=${entityIdStr} model=${normalizedModel}`,
      );
      return { prewarmed: false };
    }
    const systemPrompt = chatSystemPrompt(normalizedModel);
    const providerAccountCredentialRevision = args.providerAccountId
      ? await resolveProviderAccountCredentialRevision(
          ctx,
          args.providerAccountId,
          args.credentialOwnerUserId ?? args.userId,
          normalizedModel,
        )
      : undefined;
    const optsSig = buildDaemonOptsSig(
      normalizedModel,
      args.allowedTools,
      args.providerAccountId,
      providerAccountCredentialRevision,
      streamingEntityId,
      {
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
      },
      systemPrompt,
    );
    const probeAliveState = async (): Promise<string> => {
      const alive = await execHandle(
        sandbox,
        buildDaemonAliveCheckCmd(args.entityIdField, entityIdStr, fp, optsSig),
        10,
      );
      return alive.trim().split("\n").pop()?.trim() ?? "cold";
    };

    const withClaimPaused = async (
      decide: () => Promise<{ prewarmed: boolean } | null>,
    ): Promise<{ prewarmed: boolean } | null> => {
      const setPause = (paused: boolean) =>
        ctx.runMutation(internal.sandboxDaemon.setDaemonClaimPause, {
          entityTable: args.entityTable,
          entityId: entityIdStr,
          paused,
        });
      await setPause(true);
      try {
        return await decide();
      } finally {
        await setPause(false);
      }
    };

    const readTurnSnapshot = async (): Promise<
      DaemonTurnSnapshot & { pendingModel: string | undefined }
    > => {
      const snapshot = await ctx.runQuery(
        internal.sandboxDaemon.readDaemonEntitySnapshot,
        { entityTable: args.entityTable, entityId: entityIdStr },
      );
      return {
        pendingTurnStaged: snapshot.pendingTurn !== undefined,
        activeWorkflow: snapshot.activeWorkflow,
        syntheticTurnMessageId: snapshot.syntheticTurnMessageId,
        pendingModel: snapshot.pendingTurn?.model,
      };
    };

    const killDaemon = () =>
      execHandle(
        sandbox,
        buildKillEntityDaemonCmd(args.entityIdField, entityIdStr),
        10,
      );

    const settleIfReady = async (
      aliveState: string,
    ): Promise<{ prewarmed: boolean } | null> => {
      if (aliveState === "alive") {
        console.log(
          `[sandbox][execution] prewarmEntityDaemon: already warm entityId=${entityIdStr}`,
        );
        return { prewarmed: false };
      }
      if (aliveState === "stale") {
        console.log(
          `[sandbox][execution] prewarmEntityDaemon: stale callback script — uploading bundle entityId=${entityIdStr}`,
        );
        await uploadCallbackScriptBundle(sandbox);
        return await withClaimPaused(async () => {
          const snapshot = await readTurnSnapshot();
          if (shouldDeferDaemonRespawn(snapshot)) {
            console.log(
              `[sandbox][execution] prewarmEntityDaemon: stale callback script but mid-turn — deferring respawn entityId=${entityIdStr}`,
            );
            return { prewarmed: false };
          }
          await killDaemon();
          return null;
        });
      }
      return null;
    };

    const stopRequested = () =>
      ctx.runQuery(internal.sandboxDaemon.isEntitySandboxStopRequested, {
        entityTable: args.entityTable,
        entityId: entityIdStr,
      });
    const skipIfStopped = async (): Promise<boolean> => {
      if (!(await stopRequested())) return false;
      console.log(
        `[sandbox][execution] prewarmEntityDaemon: stop requested — skipping entityId=${entityIdStr} after ${Date.now() - startedAt}ms`,
      );
      return true;
    };

    const initialReady = await settleIfReady(await probeAliveState());
    if (initialReady !== null) return initialReady;

    const claimLease = () =>
      ctx.runMutation(internal.sandboxDaemon.claimDaemonLaunchLease, {
        entityId: entityIdStr,
      });
    let leased = await claimLease();
    if (!leased) {
      console.log(
        `[sandbox][execution] prewarmEntityDaemon: launch lease held — waiting for in-flight launch entityId=${entityIdStr}`,
      );
      const waitDeadline = Date.now() + PREWARM_LAUNCH_LEASE_WAIT_MS;
      while (!leased && Date.now() < waitDeadline) {
        await sleep(PREWARM_LAUNCH_LEASE_POLL_MS);
        if (await skipIfStopped()) return { prewarmed: false };
        const waitedReady = await settleIfReady(await probeAliveState());
        if (waitedReady !== null) return waitedReady;
        leased = await claimLease();
      }
      if (!leased) {
        console.log(
          `[sandbox][execution] prewarmEntityDaemon: launch lease held — giving up after ${Date.now() - startedAt}ms entityId=${entityIdStr}`,
        );
        return { prewarmed: false };
      }
    }
    try {
      const aliveState = await probeAliveState();
      const claimedReady = await settleIfReady(aliveState);
      if (claimedReady !== null) return claimedReady;
      if (aliveState === "optsmismatch") {
        const deferred = await withClaimPaused(async () => {
          const snapshot = await readTurnSnapshot();
          if (shouldDeferDaemonRespawn(snapshot)) {
            console.log(
              `[sandbox][execution] prewarmEntityDaemon: model/tools mismatch but mid-turn — deferring respawn entityId=${entityIdStr}`,
            );
            return { prewarmed: false };
          }
          const pendingModel = snapshot.pendingModel;
          if (
            pendingModel !== undefined &&
            normalizeAIModel(pendingModel) !== normalizedModel
          ) {
            console.log(
              `[sandbox][execution] prewarmEntityDaemon: pendingTurn targets different model — deferring respawn entityId=${entityIdStr} pending=${pendingModel} launch=${normalizedModel}`,
            );
            return { prewarmed: false };
          }
          const onDiskSig = await execHandle(
            sandbox,
            `cat ${JSON.stringify(entityDaemonPaths(args.entityIdField, entityIdStr).opts)} 2>/dev/null || true`,
            5,
          ).catch(() => "");
          console.log(
            `[sandbox][execution] prewarmEntityDaemon: model/tools changed — respawning entityId=${entityIdStr} have=${onDiskSig.trim()} want=${optsSig}`,
          );
          await killDaemon();
          return null;
        });
        if (deferred !== null) return deferred;
      }

      if (await skipIfStopped()) return { prewarmed: false };
      await ensureSandboxRunning(sandbox, {
        timeoutSeconds: ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS,
        skipDocker: true,
      });

      const claudeSessionId =
        getAIModelProvider(normalizedModel) === "claude" &&
        args.sessionPersistenceId
          ? sessionClaudeUuid(args.sessionPersistenceId)
          : undefined;

      await signAndLaunchScript(
        ctx,
        sandbox,
        args.userId,
        "",
        args.completionMutation,
        args.entityIdField,
        entityIdStr,
        args.repoId,
        {
          model: normalizedModel,
          allowedTools: args.allowedTools,
          systemPrompt,
          claimMutation: args.claimMutation,
          openSyntheticTurnMutation: args.openSyntheticTurnMutation,
          completeSyntheticTurnMutation: args.completeSyntheticTurnMutation,
          updateBackgroundAgentsMutation: args.updateBackgroundAgentsMutation,
          updateGoalMutation: args.updateGoalMutation,
          extraEnvVars: {
            EVA_DAEMON_OPTS: optsSig,
            STREAMING_ENTITY_ID: streamingEntityId,
            ...buildTraitEnvVars({
              reasoningLevel: args.reasoningLevel,
              thinkingEnabled: args.thinkingEnabled,
              use1mContext: args.use1mContext,
              fastMode: args.fastMode,
            }),
          },
          claudeSessionId,
          providerAccountId: args.providerAccountId,
          credentialOwnerUserId: args.credentialOwnerUserId,
          enableMcp: true,
        },
      );
      console.log(
        `[sandbox][execution] prewarmEntityDaemon: launched in ${Date.now() - startedAt}ms entityId=${entityIdStr}`,
      );
      return { prewarmed: true };
    } finally {
      await ctx.runMutation(internal.sandboxDaemon.releaseDaemonLaunchLease, {
        entityId: entityIdStr,
      });
    }
  } catch (error) {
    console.log(
      `[sandbox][execution] prewarmEntityDaemon: skipped in ${Date.now() - startedAt}ms entityId=${args.entityId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { prewarmed: false };
  }
}

/**
 * Pushes the sandbox's hard session deadline out by `durationMs`. Vercel's
 * `timeout` is a hard per-session runtime cap — turns that outlive it are
 * killed mid-work with no snapshot (filesystem rolls back to the pre-turn
 * snapshot on the next resume). A durable turn's lease renewal schedules
 * this (`renewTurnLease`) for every turn, quick-task runs included. Best-effort: a failed extension must
 * never fail the turn, and it must not resume a stopped sandbox — the SDK's
 * extendTimeout auto-resumes, so it runs only on a VM reported running.
 */
export const extendSandboxDeadline = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    durationMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getRunningSandboxHandle(
        ctx,
        args.repoId,
        args.sandboxId,
      );
      if (!sandbox) return null;
      await sandbox.extendTimeout(args.durationMs);
    } catch (error) {
      console.log(
        `[sandbox][execution] extendSandboxDeadline: skipped sandboxId=${args.sandboxId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

const RECONCILE_SWEEP_MAX_ENTITIES = 50;

/**
 * Periodic truth-sync between eva's "active" sandbox statuses and the
 * provider. Vercel stops VMs on its own (hard session-timeout cap, platform
 * stops) and nothing notifies eva — the only other reconcile trigger is a
 * page-mount prewarm, so a session left open in a browser tab showed
 * "active" + a dead Preview indefinitely (session 55). Runs on a cron; flips
 * stale actives to closed via reconcileStoppedSandboxStatus so the UI offers
 * Start.
 *
 * Uses classifyForReconcile (not sandbox.state): after a hard timeout Vercel's
 * attached status throws and state maps to "starting", which is intentionally
 * transient for start/stop races — but left the sweep never flipping those
 * rows. classifyForReconcile falls back to listSessions so empty/terminal
 * sessions count as dead. Mid-turn VMs are "alive" (and deadline-extended).
 */
export const reconcileStaleActiveSandboxes = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const entities = await ctx.runQuery(
      internal.sandboxDaemon.listActiveSandboxEntities,
      {},
    );
    const batch = entities.slice(0, RECONCILE_SWEEP_MAX_ENTITIES);
    let flipped = 0;
    for (const entity of batch) {
      try {
        const sandbox = await getSandboxHandle(
          ctx,
          entity.repoId,
          entity.sandboxId,
        );
        const classification = await sandbox.classifyForReconcile();
        if (classification === "dead") {
          await ctx.runMutation(
            internal.sandboxDaemon.reconcileStoppedSandboxStatus,
            {
              entityTable: entity.entityTable,
              entityId: entity.entityId,
              sandboxId: entity.sandboxId,
            },
          );
          flipped++;
        }
      } catch (error) {
        console.log(
          `[sandbox][reconcile-sweep] skipped ${entity.entityTable} ${entity.entityId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (entities.length > 0) {
      console.log(
        `[sandbox][reconcile-sweep] checked=${batch.length}/${entities.length} flipped=${flipped}`,
      );
    }
    return null;
  },
});

/** Kills only the entity-scoped warm daemon (not the whole sandbox runner). */
export const killEntityDaemon = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    entityIdField: v.string(),
    entityId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getRunningSandboxHandle(
        ctx,
        args.repoId,
        args.sandboxId,
      );
      if (!sandbox) return null;
      await execHandle(
        sandbox,
        buildKillEntityDaemonCmd(args.entityIdField, args.entityId),
        10,
      );
    } catch {
    }
    return null;
  },
});

/**
 * Warms the daemon of one session chat. Chats of a session share the sandbox
 * but each runs its own agent process, keyed by the chat id.
 */
export const prewarmSessionDaemon = internalAction({
  args: {
    sandboxId: v.string(),
    chatId: v.id("sessionChats"),
    repoId: v.id("githubRepos"),
    userId: v.id("users"),
    model: v.optional(v.string()),
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    allowedTools: v.optional(v.string()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    credentialOwnerUserId: v.optional(v.id("users")),
    sessionPersistenceId: v.optional(sessionPersistenceIdValidator),
  },
  returns: v.object({ prewarmed: v.boolean() }),
  handler: async (ctx, args): Promise<{ prewarmed: boolean }> => {
    const context = await ctx.runQuery(internal.sessionChats.getInternal, {
      chatId: args.chatId,
    });
    const skipPrewarm =
      context === null ||
      isSandboxClosingStatus(context.session.status);
    return runPrewarmEntityDaemon(ctx, {
      sandboxId: args.sandboxId,
      repoId: args.repoId,
      userId: args.userId,
      entityId: String(args.chatId),
      entityIdField: "chatId",
      completionMutation: "sessionWorkflow:handleCompletion",
      ...SESSION_DAEMON_MUTATIONS,
      model: args.model,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
      allowedTools: args.allowedTools,
      providerAccountId: args.providerAccountId,
      credentialOwnerUserId: args.credentialOwnerUserId,
      sessionPersistenceId: args.sessionPersistenceId,
      skipPrewarm,
      entityTable: "sessionChats",
    });
  },
});

const launchArgs = {
  sandboxId: v.string(),
  entityId: v.string(),
  prompt: v.string(),
  userId: v.id("users"),
  completionMutation: v.string(),
  entityIdField: v.string(),
  model: v.optional(v.string()),
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
  allowedTools: v.optional(v.string()),
  systemPrompt: v.optional(v.string()),
  repoId: v.id("githubRepos"),
  streamingEntityId: v.optional(v.string()),
  runId: v.optional(v.string()),
  sessionPersistenceId: v.optional(sessionPersistenceIdValidator),
  requireTaskCommit: v.optional(v.boolean()),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  credentialOwnerUserId: v.optional(v.id("users")),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
};

const launchArgsValidator = v.object({
  ...launchArgs,
  turnId: v.optional(v.id("turns")),
  turnLeaseGeneration: v.optional(v.number()),
});

async function launchAgentOnSandbox(
  ctx: ActionCtx,
  args: Infer<typeof launchArgsValidator>,
): Promise<void> {
  const launchStartedAt = Date.now();
  console.log(
    `[sandbox][execution] launchOnExistingSandbox started entityId=${args.entityId} sandboxId=${args.sandboxId} repoId=${args.repoId}`,
  );
  const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

  let prompt = args.prompt;
  if (args.attachmentStorageIds && args.attachmentStorageIds.length > 0) {
    const paths = await materializeAttachmentsToSandbox(
      ctx,
      sandbox,
      args.attachmentStorageIds,
    );
    prompt += buildAttachmentPromptNote(paths);
  }

  await execHandle(sandbox, KILL_PRIOR_AGENT_PROCESSES_CMD, 10);
  console.log(
    `[sandbox][execution] cleaned prior runner in ${Date.now() - launchStartedAt}ms entityId=${args.entityId}`,
  );

  const extraEnvVars: Record<string, string> = {};
  if (args.streamingEntityId) {
    extraEnvVars.STREAMING_ENTITY_ID = args.streamingEntityId;
    const existing = await ctx.runQuery(internal.streaming.internalGet, {
      entityId: args.streamingEntityId,
    });
    if (existing) {
      extraEnvVars.PRIOR_STEPS = existing.currentActivity;
    }
  }
  if (args.runId) {
    extraEnvVars.RUN_ID = args.runId;
  }
  if (args.requireTaskCommit === true) {
    extraEnvVars.REQUIRE_TASK_COMMIT = "true";
  }
  if (args.turnId !== undefined && args.turnLeaseGeneration !== undefined) {
    extraEnvVars.TURN_ID = String(args.turnId);
    extraEnvVars.TURN_LEASE_GENERATION = String(args.turnLeaseGeneration);
  }
  Object.assign(
    extraEnvVars,
    buildTraitEnvVars({
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
    }),
  );

  const normalizedModel = normalizeAIModel(args.model);
  const claudeSessionId =
    getAIModelProvider(normalizedModel) === "claude" &&
    args.sessionPersistenceId
      ? sessionClaudeUuid(args.sessionPersistenceId)
      : undefined;

  await signAndLaunchScript(
    ctx,
    sandbox,
    args.userId,
    prompt,
    args.completionMutation,
    args.entityIdField,
    args.entityId,
    args.repoId,
    {
      model: normalizedModel,
      allowedTools: args.allowedTools,
      systemPrompt: args.systemPrompt,
      extraEnvVars:
        Object.keys(extraEnvVars).length > 0 ? extraEnvVars : undefined,
      claudeSessionId,
      providerAccountId: args.providerAccountId,
      credentialOwnerUserId: args.credentialOwnerUserId,
      enableMcp: true,
    },
  );
  console.log(
    `[sandbox][execution] launchOnExistingSandbox finished in ${Date.now() - launchStartedAt}ms entityId=${args.entityId} sandboxId=${args.sandboxId}`,
  );
}

/** Launches an AI agent script on an existing sandbox with streaming and token setup. */
export const launchOnExistingSandbox = internalAction({
  args: launchArgsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await launchAgentOnSandbox(ctx, args);
    return null;
  },
});

/**
 * Launches a one-shot agent (automation, PR recap, doc interview, evaluation,
 * test generation) under its own durable turn: opens
 * the turn already leased, then launches with the lease so the callback
 * heartbeats and completes fenced. A launch that throws closes the turn, so
 * the reconciler never tears down a workflow that handled the failure itself.
 */
export const launchAgentTurn = internalAction({
  args: {
    ...launchArgs,
    turnEntityId: turnEntityIdValidator,
    turnSessionId: v.optional(v.id("sessions")),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { turnEntityId, turnSessionId, workflowId, ...launch },
  ) => {
    const lease = await ctx.runMutation(internal.turns.openAgentTurnLease, {
      entityId: turnEntityId,
      sessionId: turnSessionId,
      streamingEntityId: launch.streamingEntityId ?? launch.entityId,
      model: launch.model,
      sandboxId: launch.sandboxId,
      repoId: launch.repoId,
      workflowId,
    });
    try {
      await launchAgentOnSandbox(ctx, {
        ...launch,
        turnId: lease.turnId,
        turnLeaseGeneration: lease.leaseGeneration,
      });
    } catch (error) {
      await ctx.runMutation(internal.turns.closeAgentTurn, {
        turnId: lease.turnId,
        error: "Agent launch failed",
      });
      throw error;
    }
    return null;
  },
});
