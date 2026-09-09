"use node";

import { v, type Infer } from "convex/values";
import { SandboxProviderError, type SandboxHandle } from "../_sandbox/provider";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import {
  getAIModelProvider,
  normalizeAIModel,
  reasoningLevelValidator,
  usesChatDaemon,
} from "../validators";
import {
  execHandle,
  resolveSandboxContext,
  getSandboxHandle,
  ensureSandboxRunning,
  ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS,
  sleep,
  errorMessage,
  signAndLaunchScript,
  KILL_PRIOR_AGENT_PROCESSES_CMD,
  sessionClaudeUuid,
  restartUnresponsiveSandbox,
} from "./helpers";
import { writeSandboxFile } from "./sandboxFiles";
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
import {
  resolveProviderAccountCredentialRevision,
  resolveSandboxCredentials,
} from "../envVarResolver";
import {
  buildConvexBackgroundScriptBody,
  isConvexBackendCommand,
  CONVEX_FUNCTIONS_READY_LOG_LINE,
} from "./convexLocalBackend";
import { ensureSwapFile } from "./swap";
import { restoreSeededRuntimeState as restoreSeededRuntimeStateInSandbox } from "./devServer";
import { isDaytonaNetworkIssue } from "../_taskWorkflow/recovery";
import { assertActionSandboxAccess } from "../functions";
import {
  isSandboxGoneError,
  isSandboxUnresponsiveError,
} from "./sandboxErrors";
import { previewProxyFailed, visiblePreviewFailure } from "./previewErrors";
import { runActionEffect } from "../_effect/action";
import {
  shouldDeferDaemonRespawn,
  type DaemonTurnSnapshot,
} from "../_chat/daemonClaimPause";

/** True if anything is LISTEN on `port` (Vercel images often lack `ss`). */
function portListenProbeCmd(port: number): string {
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  return [
    `if command -v ss >/dev/null 2>&1; then ss -ltn 2>/dev/null | grep -q ":${port} " && echo yes && exit 0; fi`,
    `if command -v lsof >/dev/null 2>&1; then lsof -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1 && echo yes && exit 0; fi`,
    // /proc/net/tcp{,6} local_address port is hex, big-endian (13000 → 32C8).
    `if grep -Eiq ":${hex}[[:space:]]" /proc/net/tcp /proc/net/tcp6 2>/dev/null; then echo yes; exit 0; fi`,
    "echo no",
  ].join("; ");
}

async function probePreviewReady(
  handle: SandboxHandle,
  port: number,
): Promise<boolean> {
  try {
    // Prefer a listen check: Next/Vite often bind before the first route
    // finishes compiling. A short HTTP curl times out mid-compile and used to
    // trigger remount → kill → relaunch loops (session 41 / CarePulse web).
    const listening = (
      await execHandle(handle, portListenProbeCmd(port), 5)
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
  pushBranchToOrigin,
  EPHEMERAL_LIFECYCLE,
  SESSION_LIFECYCLE,
} from "./git";
import { startDesktopWithChrome } from "./desktop";
import {
  ensurePreviewNavigationProxy,
  VERCEL_PREVIEW_PROXY_PORT,
  VERCEL_DESKTOP_INTERNAL_PORT,
  VERCEL_EDITOR_INTERNAL_PORT,
} from "./previewProxy";
import { vercelAppListenPort } from "./vercelAppPorts";
import { getPreviewGrantPublicJwk, signPreviewGrant } from "../previewGrant";
import { PREVIEW_GRANT_PARAM } from "../previewGrantConfig";

const sessionPersistenceKindValidator = v.union(
  v.literal("sessions"),
  v.literal("projects"),
  v.literal("agentTasks"),
);

const sessionPersistenceIdValidator = v.union(
  v.id("sessions"),
  v.id("projects"),
  v.id("agentTasks"),
);

// Must outlast DAEMON_LAUNCH_LEASE_MS (30s in daemonEntitySnapshot.ts) so a
// dead holder unblocks us at expiry, and long enough that a holder still
// running docker bootstrap (~30s on Ave's Ubuntu image) can finish and
// release. Losers then re-check alive / optsmismatch instead of giving up.
const PREWARM_LAUNCH_LEASE_WAIT_MS = 90_000;
const PREWARM_LAUNCH_LEASE_POLL_MS = 500;

/**
 * True when the sandbox being created belongs to a master (orchestrator)
 * session, which boots from the Vercel managed image instead of the repo
 * snapshot. Looked up lazily: only session-persisted flows can be one, so
 * task/project/ephemeral paths never pay the query.
 */
async function isOrchestratorSandboxSession(
  ctx: ActionCtx,
  args: {
    sessionPersistenceId?: Infer<typeof sessionPersistenceIdValidator>;
    sessionPersistenceKind?: Infer<typeof sessionPersistenceKindValidator>;
  },
): Promise<boolean> {
  if (
    args.sessionPersistenceKind !== "sessions" ||
    args.sessionPersistenceId === undefined
  ) {
    return false;
  }
  const session = await ctx.runQuery(internal.sessions.getInternal, {
    id: args.sessionPersistenceId,
  });
  return session?.isOrchestrator === true;
}

/** Checks whether a sandbox is healthy, starting it if stopped. */
export const validateSandbox = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.object({ healthy: v.boolean() }),
  handler: async (ctx, args) => {
    let sandbox: SandboxHandle | undefined;
    try {
      sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      // Start the sandbox if it's stopped (fast resume ~3-5s)
      await ensureSandboxRunning(sandbox, {
        timeoutSeconds: ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS,
      });
      return { healthy: true };
    } catch (e) {
      // Exit 137 on the `echo 1` probe / an exec that never answered: the VM
      // reports running but cannot execute commands (OOM meltdown, dead guest
      // agent). start() no-ops on a "running" VM, so re-validating as-is can
      // never recover — stop+resume once, and only if that also fails report
      // unhealthy so the caller falls back to recreating.
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

/** Executes a shell command on a sandbox and returns the output. */
export const runSandboxCommand = internalAction({
  args: {
    sandboxId: v.string(),
    command: v.string(),
    timeoutSeconds: v.optional(v.number()),
    repoId: v.id("githubRepos"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    return (
      await execHandle(handle, args.command, args.timeoutSeconds ?? 30)
    ).trim();
  },
});

/** Returns whether startup commands have already completed on this sandbox. */
export const startupCommandsMarkerExists = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    try {
      await execHandle(handle, "test -f /tmp/.startup-commands-done", 5);
      return true;
    } catch {
      return false;
    }
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
  // Get startup commands for this repo
  const commands: string[] | null = await ctx.runQuery(
    internal.repoSnapshots.getStartupCommands,
    { repoId: args.repoId },
  );

  if (!commands || commands.length === 0) {
    return { ran: false, commandCount: 0, errors: [] };
  }

  const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

  if (!args.force) {
    // Check if startup commands have already run (marker file)
    try {
      await execHandle(sandbox, "test -f /tmp/.startup-commands-done", 5);
      // Marker exists, commands already ran
      console.log(
        `[sandbox] runStartupCommands: marker exists, skipping ${commands.length} commands`,
      );
      return { ran: false, commandCount: 0, errors: [] };
    } catch {
      // Marker doesn't exist, proceed
    }
  }

  console.log(
    `[sandbox] runStartupCommands: executing ${commands.length} startup command(s)${args.force ? " (forced)" : ""}`,
  );

  const errors: string[] = [];
  for (const command of commands) {
    console.log(`[sandbox] runStartupCommands: running: ${command}`);
    try {
      // 10 minute timeout per command (supabase start can take a while)
      const output = await execHandle(sandbox, command, 600);
      console.log(`[sandbox] runStartupCommands: completed: ${command}`);
      if (output.trim()) {
        console.log(`[sandbox] output: ${output.slice(0, 500)}`);
      }
    } catch (e) {
      const msg = errorMessage(e, "command failed");
      console.error(`[sandbox] runStartupCommands: failed: ${command}`, msg);
      errors.push(`${command}: ${msg}`);
      // Continue with other commands even if one fails
    }
  }

  // Create the marker only when every command succeeded. Writing it after a
  // failed run permanently branded the sandbox as seeded: every resume then
  // marker-skipped the seed and the DB stayed empty forever. Leaving the
  // marker absent lets the next resume retry the full startup sequence.
  if (errors.length === 0) {
    try {
      await execHandle(sandbox, "touch /tmp/.startup-commands-done", 5);
    } catch {
      // Non-fatal
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
    // When true, skip the marker file check and re-run commands even if they
    // previously ran. Used by the retry flow to recover from failed runs.
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    ran: v.boolean(),
    commandCount: v.number(),
    errors: v.array(v.string()),
  }),
  handler: (ctx, args) => runStartupCommandsDirect(ctx, args),
});

/**
 * Classifies a failure from one of runBackgroundCommands' cheap launcher execs
 * (pid check, cleanup, daemon fork — none run real work inline):
 *
 * - `"command-failed"` — the VM is fine; only this command lost. Record it and
 *   carry on with the rest.
 * - `"unresponsive"` — the provider says `running` but the VM cannot execute
 *   (exit 137 / hung exec — OOM meltdown). Safe to stop+resume once.
 * - `"not-running"` — the VM is stopped/stopping/gone. Launching or restarting
 *   would either fail again or resurrect a sandbox the user just stopped, so
 *   only abort.
 *
 * A provider 400 alone proves nothing (see sandboxErrors.ts) — but execs
 * against a dead VM do surface as `Status code 400 is not ok`, so a 400 is
 * confirmed with a trivial probe. The probe is only run after the state check
 * says `running`, so it can never lazily resume a stopped VM.
 */
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

/**
 * Shell lines reading `/tmp/bg-<i>.pid` into `$pid`, blanking it unless that
 * process is still *our* daemon wrapper.
 *
 * Pid files are baked into seeded snapshots (the seed run writes them and /tmp
 * survives restore — the same reason `/tmp/.startup-commands-done` works), so
 * on a freshly restored VM the recorded number is from an earlier boot. Pids
 * are dense on a fresh boot, so it can now belong to something unrelated and
 * alive (dockerd, containerd, the eva daemon): trusting it made the heal skip a
 * relaunch forever, and signalling its process group would take out that whole
 * service. One /proc read settles it — the wrapper is `bash -l
 * /tmp/bg-cmd-<i>.sh` after setsid/nohup exec, Convex wrapper included, so the
 * script path must appear in its cmdline.
 *
 * A zombie has an empty cmdline and so never qualifies. That is the behaviour
 * we already had (signalling a zombie did nothing), and the Convex `pkill`
 * lines still reap any orphans it left behind.
 */
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
    /**
     * When true, skip daemons whose `/tmp/bg-<i>.pid` is still alive. Used by
     * the preview heal path so we do not double-start Convex.
     */
    onlyRestartDead: v.optional(v.boolean()),
    /**
     * When set, a fire-and-forget readiness watcher is scheduled for any
     * Convex daemon launched here, surfacing a non-fatal warning on the
     * session if `convex dev` never becomes ready.
     */
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
    const commands: string[] | null = await ctx.runQuery(
      internal.repoSnapshots.getBackgroundCommands,
      { repoId: args.repoId },
    );

    if (!commands || commands.length === 0) {
      return { ran: false, commandCount: 0, errors: [] };
    }

    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

    console.log(
      `[sandbox] runBackgroundCommands: launching ${commands.length} background command(s)${args.onlyRestartDead ? " (onlyRestartDead)" : ""}`,
    );

    // Last gate before the memory-hungry daemons (`convex dev` restoring a
    // large snapshot, `next dev` cold compile). ensureSandboxRunning normally
    // provisioned swap already, so this is a single cheap no-op exec — but it
    // also covers relaunch paths that reach here without a fresh boot
    // (onlyRestartDead heal, preview repair).
    await ensureSwapFile(sandbox);

    const errors: string[] = [];
    let launched = 0;
    let launchedConvex = false;
    // One stop+resume per run: exit 137 / hung execs on these cheap launcher
    // commands mean the VM itself is wedged (OOM meltdown, dead guest agent),
    // and every further launch would cascade through the same 20s+ failure.
    let restartAttempted = false;
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const isConvexCommand = isConvexBackendCommand(command);
      // Everything per command runs in one try — including the pid check and
      // cleanup execs, which used to throw uncaught out of the whole action
      // (prod 2026-09-01: exit 137 on the heal pid check surfaced as an
      // uncaught failure to every scheduled caller).
      try {
        if (args.onlyRestartDead) {
          // `kill -0` is true for zombies (state Z). After `npx convex dev`
          // dies, a defunct bash PID left heal permanently skipping relaunch.
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
              `[sandbox] runBackgroundCommands: still alive, skip: ${command}`,
            );
            continue;
          }
        }
        // Drop a stale pid / leftover Convex before (re)launch so a zombie or
        // half-dead backend cannot keep :3210 / ExportInProgress wedged.
        //
        // Kill the whole process group (`-- -$pid`), not just the recorded pid:
        // the launch below uses `setsid`, so that pid is a session/group leader
        // and the actual work (`pnpm start-db` → `supabase start` → docker CLI)
        // lives in its group. Killing the leader alone left those children
        // orphaned, still holding their fd to /tmp/bg-<i>.log — after the
        // relaunch truncated it they kept writing at the old offset (multi-KB
        // NUL hole in the log) and raced the new daemon (prod 2026-09-01). The
        // bare-pid fallback covers pid files from an older launch form, and the
        // TERM → poll → KILL grace lets supabase/docker exit cleanly. A pid
        // that fails the ownership check leaves `$pid` empty, so a stale
        // snapshot-baked file is only removed, never signalled.
        const cleanup = [
          ...ownedBgPidLines(i),
          `if [ -n "$pid" ]; then kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true`,
          `for _ in 1 2 3 4; do kill -0 -- -"$pid" 2>/dev/null || kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done`,
          `kill -KILL -- -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; fi`,
          `rm -f /tmp/bg-${i}.pid`,
        ];
        if (isConvexCommand) {
          // Use `[c]onvex` so pkill does not match this cleanup shell's cmdline.
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
        // Run the command from a script file rather than inlining it via
        // `bash -lc '<command>'`: the inline form puts the whole command text
        // into the wrapper shell's cmdline, so a user guard like
        // `pgrep -f "[c]onvex dev" || npx convex dev` matches its own wrapper
        // (the unguarded "npx convex dev" launch text) and silently never starts
        // the daemon. With a script file the cmdline is just the file path, and
        // user quoting cannot break out of anything.
        //
        // CarePulse local backends: plant glibc-safe binary + unset agent mode.
        // See convexLocalBackend.ts (anonymous mode rejects --local-backend-version).
        const scriptBody = isConvexCommand
          ? buildConvexBackgroundScriptBody(command)
          : command;
        console.log(
          `[sandbox] runBackgroundCommands: launching: ${command} (log: ${logPath})`,
        );
        // The file API, not `echo <base64> | base64 -d`. The command is
        // repo-supplied and the Convex wrapper adds a multi-KB preamble, so an
        // inline transport puts unbounded content (base64-inflated by 4/3) into
        // one `bash -lc` argument — the same 128 KB MAX_ARG_STRLEN cliff that
        // broke the preview proxy. writeFile has no such limit.
        await writeSandboxFile(sandbox, scriptPath, scriptBody, {
          executable: true,
        });
        // setsid + </dev/null fully detaches the daemon into its own session, so
        // it survives the exec session teardown even when the user's command
        // self-backgrounds. A trailing `&` would otherwise let bash -lc exit
        // immediately, letting a process-group SIGTERM reach the daemon (nohup
        // only blocks SIGHUP).
        const launchCmd = `(setsid nohup bash -l ${scriptPath} </dev/null > ${logPath} 2>&1 & echo $! > /tmp/bg-${i}.pid) && echo LAUNCHED`;
        // Short timeout — we only wait for the shell to fork the daemon.
        await execHandle(sandbox, launchCmd, 10);
        launched += 1;
        if (isConvexCommand) launchedConvex = true;
      } catch (e) {
        const verdict = await classifyBackgroundLaunchFailure(sandbox, e);
        if (
          verdict === "unresponsive" &&
          // The preview heal poll must never stop/resume a VM the user may be
          // mid-turn in; it only reports, and the lifecycle paths recover.
          !args.onlyRestartDead &&
          !restartAttempted
        ) {
          restartAttempted = true;
          console.warn(
            `[sandbox] runBackgroundCommands: sandbox ${args.sandboxId} is unresponsive (${errorMessage(e, "exec failed")}); attempting stop+resume`,
          );
          try {
            await restartUnresponsiveSandbox(sandbox);
            // The stop killed every daemon launched earlier in this run —
            // start over from the first command on the recovered VM. The
            // cleanup step makes relaunching already-attempted commands
            // idempotent.
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
          `[sandbox] runBackgroundCommands: failed to launch: ${command}`,
          msg,
        );
        errors.push(`${command}: ${msg}`);
        if (verdict !== "command-failed") {
          // The VM cannot run commands (wedged, or no longer running). Stop
          // cascading: record the skip and return a handled result — heal
          // polls and scheduled restarts get `errors`, not an uncaught action
          // failure, and no further 20s+ timeouts pile onto a dead VM.
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

    // Fire-and-forget readiness watcher: the session unlocks immediately, and
    // if `convex dev` never becomes ready the watcher surfaces a warning
    // instead of blocking startup on a grep loop (which also used to die at
    // undici's 300s headersTimeout when run as a single long exec).
    if (launchedConvex) {
      const sessionId = args.sessionId;
      const stillWanted =
        sessionId === undefined
          ? true
          : await sessionStillRunningSandbox(ctx, sessionId, args.sandboxId);
      if (!stillWanted) {
        console.log(
          `[sandbox] runBackgroundCommands: skipping Convex readiness watch, session not running ${args.sandboxId}`,
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

/** Poll cadence / budget for the fire-and-forget Convex readiness watcher. */
const CONVEX_READY_POLL_INTERVAL_MS = 10_000;
const CONVEX_READY_TIMEOUT_MS = 360_000;

/** False once the user has stopped this session or it no longer owns the VM. */
async function sessionStillRunningSandbox(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  sandboxId: string,
): Promise<boolean> {
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
    if (
      sessionId !== undefined &&
      !(await sessionStillRunningSandbox(ctx, sessionId, args.sandboxId))
    ) {
      console.log(
        `[sandbox] watchConvexReadiness: aborted, session not running ${args.sandboxId}`,
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
    // One short exec per poll: ready only when every Convex log has the line.
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
      if (
        sessionId !== undefined &&
        !(await sessionStillRunningSandbox(ctx, sessionId, args.sandboxId))
      ) {
        console.log(
          `[sandbox] watchConvexReadiness: aborted, session not running ${args.sandboxId}`,
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
        // Transient exec failures (resume races, stream closes) — keep polling.
        console.log(
          `[sandbox] watchConvexReadiness: probe failed, retrying: ${errorMessage(e, "probe failed")}`,
        );
      }
      await sleep(CONVEX_READY_POLL_INTERVAL_MS);
    }

    if (
      sessionId !== undefined &&
      !(await sessionStillRunningSandbox(ctx, sessionId, args.sandboxId))
    ) {
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
      // Tail is best-effort context only.
    }
    const detail =
      `Convex dev was not ready after ${Math.round(CONVEX_READY_TIMEOUT_MS / 60000)} minutes.\n${logTail}`.slice(
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

/**
 * Runs a repo's clean-stop commands (e.g. `supabase stop`, `pkill convex dev`)
 * sequentially, foreground, so on-disk volumes flush before a filesystem
 * snapshot. Used only by the seeded-snapshot build; never on normal starts.
 * Non-fatal per command so a partial stop still lets the snapshot proceed.
 */
export const runStopCommands = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
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
    const commands: string[] | null = await ctx.runQuery(
      internal.repoSnapshots.getStopCommands,
      { repoId: args.repoId },
    );

    if (!commands || commands.length === 0) {
      return { ran: false, commandCount: 0, errors: [] };
    }

    const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

    console.log(
      `[sandbox] runStopCommands: running ${commands.length} stop command(s)`,
    );

    const errors: string[] = [];
    for (const command of commands) {
      console.log(`[sandbox] runStopCommands: running: ${command}`);
      try {
        await execHandle(handle, command, 300);
        console.log(`[sandbox] runStopCommands: completed: ${command}`);
      } catch (e) {
        const msg = errorMessage(e, "command failed");
        console.error(`[sandbox] runStopCommands: failed: ${command}`, msg);
        errors.push(`${command}: ${msg}`);
      }
    }

    return { ran: true, commandCount: commands.length, errors };
  },
});

/** Returns a signed preview URL for a sandbox port, optionally checking readiness. */
export const getPreviewUrl = action({
  args: {
    sandboxId: v.string(),
    port: v.number(),
    checkReady: v.optional(v.boolean()),
    navigationSync: v.optional(v.boolean()),
    repoId: v.id("githubRepos"),
  },
  returns: v.object({
    url: v.string(),
    port: v.number(),
    ready: v.boolean(),
  }),
  handler: async (ctx, args) =>
    runActionEffect(
      visiblePreviewFailure(
        async (): Promise<{ url: string; port: number; ready: boolean }> => {
          const identity = await ctx.auth.getUserIdentity();
          if (!identity) {
            throw new Error("Not authenticated");
          }

          await assertActionSandboxAccess(ctx, args.repoId, args.sandboxId);

          // Validates that the repo has Vercel sandbox credentials configured;
          // throws before touching the sandbox if it does not.
          await resolveSandboxCredentials(ctx, args.repoId);
          const handle = await getSandboxHandle(
            ctx,
            args.repoId,
            args.sandboxId,
          );

          // Services listen on internal ports and the auth proxy owns the exposed
          // port (desktop 16080→6080, editor 18080→8080, app listen→3000). Probe
          // the upstream service port for readiness, not the proxy port.
          const upstreamPort =
            args.port === 6080
              ? VERCEL_DESKTOP_INTERNAL_PORT
              : args.port === 8080
                ? VERCEL_EDITOR_INTERNAL_PORT
                : vercelAppListenPort(args.port);

          let ready = true;
          if (args.checkReady) {
            // Never probe or restart the dev server on a sandbox that is not
            // running. Every exec goes through the SDK's withResume: on a
            // stopped sandbox it RESUMES it, and on a stopping/snapshotting one it
            // waits the stop out and then revives it — so the preview poll loop was
            // waking sandboxes the user had just stopped. Report not-ready without
            // touching the VM; polling recovers once the sandbox is started again.
            // (handle.state is fresh: getSandboxHandle fetches with resume:false.)
            if (handle.state !== "running") {
              return { url: "", port: args.port, ready: false };
            }
            // Background daemons (e.g. `npx convex dev`) only relaunch on sandbox
            // start/resume. If they die while status stays active, Preview would
            // keep loading a frontend with a dead backend — the app port can serve
            // while a backend daemon is down, so this heal must NOT be gated on the
            // readiness probe. It IS rate-limited: the poll fires every ~2s per
            // open page and each heal execs a pid check per background command
            // inside the sandbox, which flooded prod logs and burned action time.
            // sandboxHeal.claim grants the slot to one caller per interval across
            // all concurrent viewers.
            const healClaimed = await ctx.runMutation(
              internal.sandboxHeal.claim,
              {
                sandboxId: args.sandboxId,
              },
            );
            if (healClaimed) {
              try {
                await ctx.runAction(internal.sandbox.runBackgroundCommands, {
                  sandboxId: args.sandboxId,
                  repoId: args.repoId,
                  onlyRestartDead: true,
                });
              } catch (e) {
                console.warn(
                  `[sandbox] preview background heal failed sandbox=${args.sandboxId}: ${errorMessage(e, "heal failed")}`,
                );
              }
            }
            ready = await probePreviewReady(handle, upstreamPort);
            // Preview never launches the app inline: Lifecycle owns Console
            // (`launchPreviewDevServer` → tmux) as the single launcher. But nothing
            // watches the dev server after launch — an OOM kill or a lazily-resumed
            // VM (exec on a stopped sandbox restores no services) leaves the app
            // port dead while the sandbox runs, and only this poll notices. So on a
            // claimed heal with a failed probe, schedule recovery THROUGH the
            // Console launcher (visible in Console, port-busy idempotent). Reusing
            // the heal claim rate-limits recovery attempts to one per interval.
            // Desktop (6080) and editor (8080) have their own lifecycles.
            if (
              !ready &&
              healClaimed &&
              args.port !== 6080 &&
              args.port !== 8080
            ) {
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
          }

          // Always front the service with the in-sandbox auth proxy so open-in-new-tab
          // is gated the same way for Preview, Computer, and Editor.
          //
          // Vercel exposes a fixed 4-port set. Map:
          //   app/dev → proxy on 3000 (upstream = listen port; 54321 left for Supabase)
          //   editor  → proxy on 8080  (upstream 18080)
          //   desktop → proxy on 6080  (upstream 16080)
          const previewPublicJwk = getPreviewGrantPublicJwk();
          const isVercelDesktopOrEditor =
            args.port === 6080 || args.port === 8080;
          const fixedVercelProxyPort = isVercelDesktopOrEditor
            ? args.port
            : VERCEL_PREVIEW_PROXY_PORT;
          // Public route port: on Vercel app/dev previews this is always 3000, never
          // the upstream listen port (e.g. Next 13000 / 3001, Vite 5173).
          let previewPort = fixedVercelProxyPort ?? args.port;
          // Same upstream mapping used for the readiness probe above.
          const proxyTargetPort = upstreamPort;
          const shouldStartPreviewProxy = fixedVercelProxyPort !== undefined;
          if (ready && shouldStartPreviewProxy) {
            try {
              previewPort = await ensurePreviewNavigationProxy(
                handle,
                proxyTargetPort,
                {
                  publicKeyJwk: previewPublicJwk,
                  sandboxId: args.sandboxId,
                  repoId: args.repoId,
                  webAppUrl: process.env.WEB_APP_URL ?? "",
                  inject: args.navigationSync === true,
                  // Browser-facing port for /preview-auth (public proxy, not listen).
                  authPort: fixedVercelProxyPort ?? args.port,
                },
                fixedVercelProxyPort,
              );
            } catch (e) {
              const proxyErrorMessage = errorMessage(e, "proxy startup failed");
              console.warn(
                `[sandbox] preview navigation proxy unavailable for sandbox=${args.sandboxId} port=${args.port}: ${proxyErrorMessage}`,
              );
              // Vercel only exposes a fixed, small port set (VERCEL_DEFAULT_EXPOSED_PORTS).
              // If the reserved proxy port fails to start while a preview grant
              // key is configured, silently falling back to the unproxied service
              // port would serve with no auth gate at all. Fail loudly instead.
              if (fixedVercelProxyPort !== undefined && previewPublicJwk) {
                throw previewProxyFailed(
                  fixedVercelProxyPort,
                  proxyErrorMessage,
                  e,
                );
              }
            }
          }

          const signedPreview = await handle.previewUrl(previewPort, 86400);
          const parsedUrl = new URL(signedPreview.url);
          parsedUrl.protocol = "https:";

          // Append a fresh short-lived grant so the in-app iframe (and the authed
          // user's "open in new tab") loads without a login round-trip. The proxy
          // exchanges it for a session cookie on first load. Only when gating is
          // configured — otherwise the URL stays a plain proxied URL.
          if (previewPublicJwk && ready) {
            const grant = await signPreviewGrant({
              sandboxId: args.sandboxId,
              // Grant must match AUTH_PORT (public proxy on Vercel app previews).
              port: fixedVercelProxyPort ?? args.port,
              sub: identity.subject,
            });
            parsedUrl.searchParams.set(PREVIEW_GRANT_PARAM, grant);
          }

          const url = parsedUrl.toString();
          return { url, port: args.port, ready };
        },
      ),
      `sandbox.getPreviewUrl sandbox=${args.sandboxId} port=${args.port}`,
    ),
});

const MAX_SETUP_ELAPSED_MS = 8 * 60 * 1000;
const QUICK_TASK_MAX_TOTAL_RUNTIME_MS = "5400000";

/** Checks if a sandbox setup error is transient and worth retrying. */
function isSandboxSetupRetryable(message: string): boolean {
  if (isDaytonaNetworkIssue(message)) {
    return true;
  }
  const lowered = message.toLowerCase();
  const gitNetworkMarkers = [
    "status code 502",
    "status code 503",
    "status code 504",
    "fetch failed",
    "gnutls recv error",
    "tls connection was non-properly terminated",
    "remote end hung up unexpectedly",
    "http/2 stream",
    "early eof",
    "connection reset by peer",
    "rpc failed",
  ];
  return (
    (lowered.includes("sandbox exec") && lowered.includes("timed out")) ||
    lowered.includes("command execution timeout") ||
    // Exit code -1 typically means the command was terminated abnormally
    // (sandbox not yet accepting commands, transport error, killed mid-exec) —
    // this is transient, unlike non-zero exit codes from real command failures.
    lowered.includes("sandbox command failed with exit code -1") ||
    gitNetworkMarkers.some((marker) => lowered.includes(marker))
  );
}

/** Creates or resumes a sandbox with local branch setup, desktop, and retry logic. */
export const prepareSandbox = internalAction({
  args: {
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    ephemeral: v.optional(v.boolean()),
    repoId: v.id("githubRepos"),
    attachRunId: v.optional(v.id("agentRuns")),
    sessionPersistenceId: v.optional(sessionPersistenceIdValidator),
    sessionPersistenceKind: v.optional(sessionPersistenceKindValidator),
    startDesktop: v.optional(v.boolean()),
    streamingEntityId: v.optional(v.string()),
  },
  returns: v.object({
    sandboxId: v.string(),
  }),
  handler: async (ctx, args) => {
    const completedSteps: Array<{
      type: string;
      label: string;
      status: string;
    }> = [];
    const emitProgress = async (label: string): Promise<void> => {
      if (!args.streamingEntityId) return;
      const steps = [
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
      `[sandbox] prepareSandbox: resolving context for repo=${args.repoOwner}/${args.repoName} repoId=${args.repoId} ephemeral=${args.ephemeral ?? false}`,
    );
    // A master session whose sandbox died resumes through here, so the image
    // override has to be resolved on this path too — otherwise it would fall
    // back to a repo snapshot (or bare node24) instead of the managed image.
    const isOrchestrator = await isOrchestratorSandboxSession(ctx, args);
    const { client, sandboxEnvVars, snapshotName, image } =
      await resolveSandboxContext(ctx, args.repoId, { isOrchestrator });
    const existingSandboxId = args.existingSandboxId;
    console.log(
      `[sandbox] prepareSandbox: context resolved in ${Date.now() - setupStartedAt}ms — snapshot=${snapshotName ?? "none"}, image=${image ?? "none"}, existingSandbox=${existingSandboxId ?? "none"}`,
    );
    let sandbox: SandboxHandle | undefined;
    let deleteSandboxOnFailure = false;
    let attempt = 1;
    const maxSetupAttempts = 3;
    const attachRunSandbox = async (
      sandboxToAttach: SandboxHandle,
    ): Promise<void> => {
      if (!args.attachRunId) {
        return;
      }
      await ctx.runMutation(internal.taskWorkflow.saveSandboxId, {
        runId: args.attachRunId,
        sandboxId: sandboxToAttach.id,
      });
    };

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
            attachRunSandbox,
            emitProgress,
            { mode: "none" },
            undefined,
            isOrchestrator,
            image,
            isOrchestrator,
          );
          sandbox = prepared.sandbox;
          deleteSandboxOnFailure = true;
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
            isOrchestrator,
            image,
            isOrchestrator,
          );
          sandbox = prepared.sandbox;
          deleteSandboxOnFailure = prepared.isNew;
        }

        if (args.branchName) {
          await emitProgress("Setting up branch...");
          await setupBranch(
            sandbox,
            args.branchName,
            args.baseBranch ?? FALLBACK_GIT_BASE_BRANCH,
          );
        } else if (args.baseBranch) {
          await emitProgress("Checking out base branch...");
          await checkoutFetchedBaseBranch(sandbox, args.baseBranch);
        }

        if (args.startDesktop) {
          await emitProgress("Starting desktop...");
          await startDesktopWithChrome(sandbox);
        }

        break;
      } catch (error) {
        if (deleteSandboxOnFailure && sandbox) {
          console.warn(
            `[sandbox] prepareSandbox: deleting failed sandbox ${sandbox.id}`,
          );
          try {
            await sandbox.delete();
          } catch {}
          // Best-effort cleanup of the credential-helper row. No-op if absent.
          await ctx.runMutation(
            internal.sandboxGitCredentials.deleteBySandboxId,
            { sandboxId: sandbox.id },
          );
        }

        const message = errorMessage(error, "Sandbox setup failed");
        const elapsed = Date.now() - setupStartedAt;
        const retryable = isSandboxSetupRetryable(message);
        const withinTimeLimit = elapsed < MAX_SETUP_ELAPSED_MS;
        const shouldRetry = retryable && withinTimeLimit;

        console.warn(
          `[sandbox] prepareSandbox: attempt ${attempt}/${maxSetupAttempts} failed after ${elapsed}ms — retryable=${retryable}, withinTimeLimit=${withinTimeLimit}, shouldRetry=${shouldRetry}: ${message}`,
        );

        if (!shouldRetry || attempt >= maxSetupAttempts) {
          console.error(
            `[sandbox] prepareSandbox: giving up after ${attempt} attempt(s), total elapsed=${elapsed}ms: ${message}`,
          );
          throw error;
        }

        const delayMs =
          2500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
        console.warn(`[sandbox] prepareSandbox: retrying in ${delayMs}ms`);
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
      `[sandbox] prepareSandbox: success in ${totalElapsed}ms, sandboxId=${sandbox.id}, attempts=${attempt}`,
    );
    return {
      sandboxId: sandbox.id,
    };
  },
});

/** Creates or resumes a sandbox without performing repo sync. */
export const createOrResumeSandbox = internalAction({
  args: {
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    ephemeral: v.optional(v.boolean()),
    repoId: v.id("githubRepos"),
    sessionPersistenceId: v.optional(sessionPersistenceIdValidator),
    sessionPersistenceKind: v.optional(sessionPersistenceKindValidator),
    attachRunId: v.optional(v.id("agentRuns")),
    streamingEntityId: v.optional(v.string()),
  },
  returns: v.object({
    sandboxId: v.string(),
    resumeFellBack: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const completedSteps: Array<{
      type: string;
      label: string;
      status: string;
    }> = [];
    const emitProgress = async (label: string): Promise<void> => {
      if (!args.streamingEntityId) return;
      const steps = [
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
    // Same reason as prepareSandbox: a master session resuming after its
    // sandbox died must land on the managed image, not a repo snapshot.
    const isOrchestrator = await isOrchestratorSandboxSession(ctx, args);
    const { client, sandboxEnvVars, snapshotName, image } =
      await resolveSandboxContext(ctx, args.repoId, { isOrchestrator });
    const existingSandboxId = args.existingSandboxId;
    console.log(
      `[sandbox] createOrResumeSandbox: context resolved in ${Date.now() - setupStartedAt}ms — snapshot=${snapshotName ?? "none"}, image=${image ?? "none"}, existingSandbox=${existingSandboxId ?? "none"}`,
    );

    let sandbox: SandboxHandle | undefined;
    let resumeFellBack = false;
    let deleteSandboxOnFailure = false;
    let attempt = 1;
    const maxSetupAttempts = 3;
    const attachRunSandbox = async (
      sandboxToAttach: SandboxHandle,
    ): Promise<void> => {
      if (!args.attachRunId) {
        return;
      }
      await ctx.runMutation(internal.taskWorkflow.saveSandboxId, {
        runId: args.attachRunId,
        sandboxId: sandboxToAttach.id,
      });
    };

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
            attachRunSandbox,
            emitProgress,
            { mode: "none" },
            undefined,
            isOrchestrator,
            image,
            isOrchestrator,
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
            isOrchestrator,
            image,
            isOrchestrator,
          );
          sandbox = prepared.sandbox;
          deleteSandboxOnFailure = prepared.isNew;
          resumeFellBack = prepared.resumeFellBack;
        }

        if (!args.ephemeral && args.attachRunId && sandbox) {
          await ctx.runMutation(internal.taskWorkflow.saveSandboxId, {
            runId: args.attachRunId,
            sandboxId: sandbox.id,
          });
        }

        break;
      } catch (error) {
        if (deleteSandboxOnFailure && sandbox) {
          console.warn(
            `[sandbox] createOrResumeSandbox: deleting failed sandbox ${sandbox.id}`,
          );
          try {
            await sandbox.delete();
          } catch {}
          // Best-effort cleanup of the credential-helper row. No-op if absent.
          await ctx.runMutation(
            internal.sandboxGitCredentials.deleteBySandboxId,
            { sandboxId: sandbox.id },
          );
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
      // Deleted `eva/automation-*` refs and never-pushed task branches are
      // expected. Returning here keeps Convex from recording status=failure
      // plus an Uncaught SandboxCommandFailedError. Checkout/setup already
      // falls back to local snapshot refs via resolveBaseTarget.
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
  // `pushed` records whether this action moved the ref. `published` also
  // recognises a matching remote branch written by the pre-completion callback.
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
      // Rethrow so callers can surface the failure and preserve the sandbox for
      // recovery. Swallowing here made every caller's error handling dead code.
      throw error;
    }
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
  noWrites?: boolean,
): string {
  const fastMode =
    traits.fastMode === undefined ? "" : traits.fastMode ? "1" : "0";
  // `noWrites` is a suffix appended only when set, rather than another `|`
  // field: a new field would change the signature of every writing session too
  // and kill+respawn every warm daemon in the fleet on deploy, for no gain.
  const readOnly = noWrites === true ? "|nowrites" : "";
  return `${normalizedModel}|${allowedTools ?? ""}|${traits.reasoningLevel ?? ""}|${traits.thinkingEnabled === false ? "0" : ""}|${traits.use1mContext === true ? "1" : ""}|${fastMode}|${providerAccountId ?? ""}|${providerAccountCredentialRevision ?? ""}|${streamingEntityId}${readOnly}`;
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
  model?: string;
  reasoningLevel?: Infer<typeof reasoningLevelValidator>;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
  allowedTools?: string;
  noWrites?: boolean;
  providerAccountId?: Id<"userProviderAccounts">;
  credentialOwnerUserId?: Id<"users">;
  sessionPersistenceId?: Infer<typeof sessionPersistenceIdValidator>;
  streamingEntityId?: string;
  activeWorkflowField: "activeWorkflowId" | "activeChatWorkflowId";
  skipPrewarm?: boolean;
  /**
   * Manager Ave never runs repo services. Passing this through to
   * `ensureSandboxRunning` keeps a lastModel prewarm from holding the launch
   * lease across a 30s+ dockerd poll on the Ubuntu image (no `dnf`).
   */
  skipDocker?: boolean;
};

type PrewarmEntityDaemonParams = PrewarmEntityDaemonBaseParams & {
  entityTable: "sessions" | "agentTasks" | "projects";
};

/** Shared implementation for prewarmEntityDaemon and prewarmSessionDaemon. */
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
    // Never exec on a sandbox that is not running. On Vercel, any exec — even
    // the daemon alive-check below — lazily resumes a stopped VM, resurrecting
    // it WITHOUT its dev server, Convex backend, or Console tmux session
    // (services only launch in the startup workflow). Prewarm is best-effort:
    // skip instead, and flip a stale "active" status to "closed" so the UI
    // offers Start — which also stops connectPty from resurrecting it.
    //
    // Use classifyForReconcile (not sandbox.state): a hard-timeouted Vercel VM
    // makes status throw and state reports "starting", which would skip the
    // flip forever while the UI still says active.
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
      args.noWrites,
    );
    const probeAliveState = async (): Promise<string> => {
      const alive = await execHandle(
        sandbox,
        buildDaemonAliveCheckCmd(args.entityIdField, entityIdStr, fp, optsSig),
        10,
      );
      return alive.trim().split("\n").pop()?.trim() ?? "cold";
    };

    /**
     * Runs `decide` with turn claims fenced off, so the daemon this prewarm is
     * about to kill cannot claim a turn (and its 2-minute running lease)
     * between the decision and the process dying. Always clears the fence.
     */
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
        // Safe before the mid-turn check: this only touches disk. The live
        // daemon notices the new fingerprint and exits for respawn itself once
        // its work settles (callbackScriptWentStaleOnDisk).
        await uploadCallbackScriptBundle(sandbox);
        return await withClaimPaused(async () => {
          const snapshot = await readTurnSnapshot();
          if (shouldDeferDaemonRespawn(snapshot)) {
            console.log(
              `[sandbox][execution] prewarmEntityDaemon: stale callback script but mid-turn — deferring respawn entityId=${entityIdStr}`,
            );
            return { prewarmed: false };
          }
          // Disk now matches the expected fingerprint, so a follow-up probe
          // would report "alive" while the old process is still running the
          // previous bundle. Kill so this prewarm falls through to launch.
          await killDaemon();
          return null;
        });
      }
      return null;
    };

    const initialReady = await settleIfReady(await probeAliveState());
    if (initialReady !== null) return initialReady;

    // Single-flight the kill+launch: prewarm bursts (page opens, doc-patch
    // refires) all reach here seeing "cold" during the multi-second launch
    // window; only the lease claimant proceeds. The in-sandbox spawn flock is
    // the hard guarantee — this just stops losers paying a full launch.
    //
    // Losers used to return immediately. That stranded a pending-turn prewarm
    // when page-open had already claimed the lease with a stale lastModel:
    // send/workflow fire once, lose the race, and nothing retried, so the
    // wrong daemon mismatch-polled claimPendingTurn until a later prewarm
    // happened to run (observed: ~3 minutes on Manager Ave).
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
      // Re-probe after claiming: the holder may have finished as a different
      // model during the wait, and the first probe is stale even on the
      // no-wait path (TOCTOU between alive-check and lease).
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
          // Log both sigs so the diverging field is visible (the bare
          // "respawning" line hid the reasoning-level mismatch behind the
          // session-166 hang). Read the on-disk sig only on this rare path so
          // alive/cold probes pay no extra exec. The sig carries model, tools,
          // trait flags, account id, revision and entity id — no secrets.
          // Best-effort: a failed read must not abort the respawn.
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

      await ensureSandboxRunning(sandbox, {
        timeoutSeconds: ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS,
        skipDocker: args.skipDocker === true,
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
          noWrites: args.noWrites,
          claimMutation: args.claimMutation,
          openSyntheticTurnMutation: args.openSyntheticTurnMutation,
          completeSyntheticTurnMutation: args.completeSyntheticTurnMutation,
          updateBackgroundAgentsMutation: args.updateBackgroundAgentsMutation,
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
 * Pre-warm a provider chat daemon for any entity (session, task chat, project
 * chat). No-op for one-shot providers or when a matching daemon is already
 * alive. Best-effort: failures are swallowed.
 */
export const prewarmEntityDaemon = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    userId: v.id("users"),
    entityId: v.string(),
    entityIdField: v.string(),
    completionMutation: v.string(),
    claimMutation: v.string(),
    openSyntheticTurnMutation: v.string(),
    completeSyntheticTurnMutation: v.string(),
    updateBackgroundAgentsMutation: v.string(),
    model: v.optional(v.string()),
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    allowedTools: v.optional(v.string()),
    /** Read-only turn: translated per SDK in the callback. See `sessionTurnTools`. */
    noWrites: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    credentialOwnerUserId: v.optional(v.id("users")),
    sessionPersistenceId: v.optional(sessionPersistenceIdValidator),
    streamingEntityId: v.optional(v.string()),
    activeWorkflowField: v.union(
      v.literal("activeWorkflowId"),
      v.literal("activeChatWorkflowId"),
    ),
    skipPrewarm: v.optional(v.boolean()),
    entityTable: v.union(
      v.literal("sessions"),
      v.literal("agentTasks"),
      v.literal("projects"),
    ),
  },
  returns: v.object({ prewarmed: v.boolean() }),
  handler: async (ctx, args): Promise<{ prewarmed: boolean }> =>
    runPrewarmEntityDaemon(ctx, args),
});

/**
 * Pushes the sandbox's hard session deadline out by `durationMs`. Vercel's
 * `timeout` is a hard per-session runtime cap — turns that outlive it are
 * killed mid-work with no snapshot (filesystem rolls back to the pre-turn
 * snapshot on the next resume). The stall watchdog schedules this on every
 * not-stale tick of an active turn. Best-effort: a failed extension must
 * never fail the turn, and it must not resume a stopped sandbox (getting a
 * handle does not exec; extendTimeout on a stopped sandbox errors harmlessly).
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
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      await sandbox.extendTimeout(args.durationMs);
    } catch (error) {
      console.log(
        `[sandbox][execution] extendSandboxDeadline: skipped sandboxId=${args.sandboxId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

// Reconcile sweep cap per tick: one provider GET per entity, so bound the
// worst case. Anything past the cap is caught on the next interval.
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
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      await execHandle(
        sandbox,
        buildKillEntityDaemonCmd(args.entityIdField, args.entityId),
        10,
      );
    } catch {
      /* sandbox may be stopped */
    }
    return null;
  },
});

/**
 * Pre-warm a session's provider daemon so the user's FIRST message is warm.
 *
 * The ~20s "slow hi" is a cold respawn: after the daemon idle-exits (or a
 * fresh/resumed sandbox), the first message pays token mint + 132KB script
 * upload + node/CLI boot before any token. This action, fired when the session
 * page opens, does that boot ahead of time: it launches the provider runtime
 * and waits for the first prompt via the handoff protocol. By
 * the time the user types, tryWarmDaemonHandoff finds a live daemon and the turn
 * skips the boot entirely. No-op if a daemon is already alive for this session.
 * Best-effort: any failure is swallowed (the normal path still works).
 */
export const prewarmSessionDaemon = internalAction({
  args: {
    sandboxId: v.string(),
    sessionId: v.id("sessions"),
    repoId: v.id("githubRepos"),
    userId: v.id("users"),
    model: v.optional(v.string()),
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
    allowedTools: v.optional(v.string()),
    /** Read-only turn: translated per SDK in the callback. See `sessionTurnTools`. */
    noWrites: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    credentialOwnerUserId: v.optional(v.id("users")),
    sessionPersistenceId: v.optional(sessionPersistenceIdValidator),
  },
  returns: v.object({ prewarmed: v.boolean() }),
  handler: async (ctx, args): Promise<{ prewarmed: boolean }> => {
    const session = await ctx.runQuery(internal.sessions.getInternal, {
      id: args.sessionId,
    });
    const skipPrewarm =
      session === null ||
      session === undefined ||
      session.status === "closed" ||
      session.status === "stopping";
    return runPrewarmEntityDaemon(ctx, {
      sandboxId: args.sandboxId,
      repoId: args.repoId,
      userId: args.userId,
      entityId: String(args.sessionId),
      entityIdField: "sessionId",
      completionMutation: "sessionWorkflow:handleCompletion",
      ...SESSION_DAEMON_MUTATIONS,
      model: args.model,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
      allowedTools: args.allowedTools,
      noWrites: args.noWrites,
      providerAccountId: args.providerAccountId,
      credentialOwnerUserId: args.credentialOwnerUserId,
      sessionPersistenceId: args.sessionPersistenceId,
      activeWorkflowField: "activeWorkflowId",
      skipPrewarm,
      skipDocker: session?.isOrchestrator === true,
      entityTable: "sessions",
    });
  },
});

/** Launches an AI agent script on an existing sandbox with streaming and token setup. */
export const launchOnExistingSandbox = internalAction({
  args: {
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
    /** Read-only turn: translated per SDK in the callback. See `sessionTurnTools`. */
    noWrites: v.optional(v.boolean()),
    systemPrompt: v.optional(v.string()),
    repoId: v.id("githubRepos"),
    streamingEntityId: v.optional(v.string()),
    runId: v.optional(v.string()),
    sessionPersistenceId: v.optional(sessionPersistenceIdValidator),
    requireTaskCommit: v.optional(v.boolean()),
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    /** Entity owner for personal-credential decrypt; defaults to `userId`. */
    credentialOwnerUserId: v.optional(v.id("users")),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    turnId: v.optional(v.id("turns")),
    turnLeaseGeneration: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const launchStartedAt = Date.now();
    console.log(
      `[sandbox][execution] launchOnExistingSandbox started entityId=${args.entityId} sandboxId=${args.sandboxId} repoId=${args.repoId}`,
    );
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

    // Download any user-attached input images into the sandbox and point the
    // agent at them via a prompt note (the CLI providers read files by path).
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
    // Session-wide trait overrides. Only non-default values are sent from the UI;
    // the runner maps effort to each provider's native control (see config.ts).
    Object.assign(
      extraEnvVars,
      buildTraitEnvVars({
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
      }),
    );
    extraEnvVars.CLAUDE_MAX_TOTAL_RUNTIME_MS = QUICK_TASK_MAX_TOTAL_RUNTIME_MS;

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
        noWrites: args.noWrites,
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

    return null;
  },
});
