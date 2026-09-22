"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  execHandle,
  getSandboxHandle,
  KILL_PRIOR_AGENT_PROCESSES_CMD,
  withTimeout,
} from "./helpers";
import { releaseSwapFile } from "./swap";

/**
 * Total budget for one stopSandbox attempt. Must stay well under the 600s
 * action cap: the calling finalizeStop* actions share that cap, and if this
 * child eats the whole budget the parent is killed by timeout before its catch
 * can settle entity status — leaving the task/project/session wedged on
 * "stopping" forever (observed in prod: cold resume + swap release + stop
 * confirmation together overran 600s).
 */
const STOP_SANDBOX_BUDGET_MS = 480_000;

/** Bound on the pre-stop refresh — a wedged VM must not eat the stop budget. */
const REFRESH_BUDGET_MS = 30_000;
/** Bound on the pre-stop swap release (script exec timeout is 120s). */
const SWAP_RELEASE_BUDGET_MS = 150_000;
const CALLBACK_LIVENESS_COMMAND = [
  "test -f /tmp/run-design.pid",
  "test ! -f /tmp/run-design.done",
  'pid="$(cat /tmp/run-design.pid)"',
  'kill -0 "$pid" 2>/dev/null',
  'state="$(ps -p "$pid" -o stat= 2>/dev/null | tr -d " ")"',
  'case "$state" in Z*) exit 1 ;; *) exit 0 ;; esac',
].join(" && ");
/** Agent still running even if callback PID bookkeeping is stale. Cursor and
 * OpenCode drive their turns from inside the callback (run-design.mjs) since
 * the SDK migrations, so the callback process itself counts as agent liveness;
 * cursor-agent and `opencode run` stay for pre-migration sandboxes. OpenCode's
 * `opencode serve` is deliberately absent: it idles between turns, so matching
 * it would report every sandbox alive forever.
 *
 * Every alternative brackets its first character (`[c]laude-code`, `/[.]claude/`)
 * for the same reason KILL_PRIOR_AGENT_PROCESSES_CMD in helpers.ts does: exec
 * wraps this in `bash -lc "<cmd>"`, so the wrapper's own cmdline contains the
 * pattern text and an unbracketed pattern always matched itself — every probe
 * reported the agent alive and the stall watchdog never killed a dead run. */
const AGENT_PROCESS_LIVENESS_COMMAND =
  "pgrep -f '[c]laude-code|[c]ursor-agent|[c]odex run|[o]pencode run|/[.]claude/|[r]un-design[.]mjs' >/dev/null 2>&1";

/**
 * Verifies whether a sandbox and its callback runner are alive.
 *
 * Used as a pre-kill liveness gate by the watchdog. When the streaming heartbeat
 * has gone stale but the sandbox + callback PID are still demonstrably alive,
 * the caller can grant a single grace cycle instead of killing immediately. This
 * protects against transient heartbeat transport failures (Convex auth flaps,
 * brief network issues) where the run itself is still healthy.
 *
 * Conservative failure handling: if we cannot reach the sandbox to determine state,
 * we report `alive: true` with reason `probe_unreachable` so the watchdog does
 * NOT kill on our inability to verify. The hard 2-hour timeout (`handleStaleRun`)
 * remains a backstop.
 */
export const verifySandboxLiveness = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.object({
    alive: v.boolean(),
    reason: v.string(),
    sandboxState: v.optional(v.string()),
    pidAlive: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const sandbox = await getSandboxHandle(
      ctx,
      args.repoId,
      args.sandboxId,
    ).catch((err: Error) => {
      console.log(
        `[watchdog][liveness] sandboxId=${args.sandboxId} probe_unreachable (getSandbox failed): ${err.message}`,
      );
      return null;
    });
    if (!sandbox) {
      return {
        alive: true,
        reason: "probe_unreachable_get_sandbox",
      };
    }

    const refreshOk = await sandbox
      .refresh()
      .then(() => true)
      .catch((err: Error) => {
        console.log(
          `[watchdog][liveness] sandboxId=${args.sandboxId} probe_unreachable (refreshData failed): ${err.message}`,
        );
        return false;
      });
    if (!refreshOk) {
      return {
        alive: true,
        reason: "probe_unreachable_refresh",
      };
    }

    const state = sandbox.state;
    // Anything that is not "running" means the callback cannot possibly be
    // running. Not started => not alive, and the watchdog should proceed to
    // clean up.
    if (state !== "running") {
      return {
        alive: false,
        reason: "sandbox_not_started",
        sandboxState: state,
      };
    }

    // Sandbox is started — verify the callback runner PID is still alive.
    // Short timeout so we never block the watchdog path on exec hangs.
    const pidAlive = await execHandle(sandbox, CALLBACK_LIVENESS_COMMAND, 5)
      .then(() => true)
      .catch(() => false);

    if (pidAlive) {
      return {
        alive: true,
        reason: "sandbox_started_pid_alive",
        sandboxState: state,
        pidAlive: true,
      };
    }

    const agentAlive = await execHandle(
      sandbox,
      AGENT_PROCESS_LIVENESS_COMMAND,
      5,
    )
      .then(() => true)
      .catch(() => false);
    if (agentAlive) {
      return {
        alive: true,
        reason: "agent_process_running_callback_pid_stale",
        sandboxState: state,
        pidAlive: false,
      };
    }

    // Exec failing on a started sandbox most likely means the PID is dead
    // (test/kill returned non-zero). Treat as dead so the watchdog cleans up.
    return {
      alive: false,
      reason: "pid_dead_or_exec_failed",
      sandboxState: state,
      pidAlive: false,
    };
  },
});

/** Kills running CLI processes (claude-code, codex, run-design) inside a sandbox. */
export const killSandboxProcess = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      await execHandle(sandbox, KILL_PRIOR_AGENT_PROCESSES_CMD, 10);
    } catch {
      // Sandbox may already be stopped/deleted
    }
    return null;
  },
});

/** Stops a sandbox (preserves state, fast resume). */
export const stopSandbox = internalAction({
  args: { sandboxId: v.string(), repoId: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await withTimeout(
        (async () => {
          const sandbox = await getSandboxHandle(
            ctx,
            args.repoId,
            args.sandboxId,
          );
          // Pre-stop steps are bounded individually: on a wedged VM the
          // refresh or the swap-release exec can hang until the whole budget
          // is gone, so stop() — a fast control-plane call — never fires.
          // Each step is best-effort; only stop() itself is load-bearing.
          let state = "unknown";
          try {
            await withTimeout(
              sandbox.refresh(),
              REFRESH_BUDGET_MS,
              `refresh ${args.sandboxId}`,
            );
            state = sandbox.state;
          } catch (refreshError) {
            console.log(
              `[sandbox] stopSandbox refresh failed sandboxId=${args.sandboxId}: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
            );
          }
          // Stop auto-snapshots the filesystem — drop the swapfile first so
          // the resume image does not carry GBs the next boot recreates for
          // free. Only on a running VM: exec on a stopped sandbox resumes it
          // (minutes on a cold restore) just to stop it again.
          if (state === "running") {
            try {
              await withTimeout(
                releaseSwapFile(sandbox),
                SWAP_RELEASE_BUDGET_MS,
                `swap release ${args.sandboxId}`,
              );
            } catch (swapError) {
              console.log(
                `[sandbox] stopSandbox swap release failed sandboxId=${args.sandboxId}: ${swapError instanceof Error ? swapError.message : String(swapError)}`,
              );
            }
          } else {
            console.log(
              `[sandbox] stopSandbox skipping swap release sandboxId=${args.sandboxId} state=${state}`,
            );
          }
          await sandbox.stop();
        })(),
        STOP_SANDBOX_BUDGET_MS,
        `stop ${args.sandboxId}`,
      );
      console.log(`[sandbox] stopSandbox ok sandboxId=${args.sandboxId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Already gone / already idle — treat as success so finalize can close.
      const benign =
        /already.?stopped|not found|does not exist|no active session|destroyed|gone/i.test(
          message,
        ) && !/did not reach a terminal stopped state/i.test(message);
      if (benign) {
        console.log(
          `[sandbox] stopSandbox ignored benign error for ${args.sandboxId}: ${message}`,
        );
        return null;
      }
      // Real stop failures must propagate — swallowing them made Eva mark the
      // session closed while Vercel still showed running.
      console.error(
        `[sandbox] stopSandbox failed for ${args.sandboxId}: ${message}`,
      );
      throw error instanceof Error ? error : new Error(message);
    }
    return null;
  },
});

// Evidence of why a run's callback process died — or stopped heartbeating —
// gathered before the sandbox (and with it /tmp and the kernel log) is
// destroyed. The dmesg grep directly confirms or rules out OOM kills; a missing
// done file means the callback was SIGKILLed (its exit handler never ran); the
// log tail shows its last words. The resource block distinguishes a dead
// process from a live one starved by swap, which is what froze a session
// daemon for six minutes and cost it its turn (see captureStalledTurnDiagnostics).
const KILL_DIAGNOSTICS_COMMAND = [
  "echo '--- oom (dmesg) ---'",
  "(dmesg 2>/dev/null | grep -iE 'out of memory|oom[-_ ]kill|killed process' | tail -n 12) || true",
  "echo '--- memory/swap (free -m) ---'",
  "free -m 2>/dev/null || true",
  "echo '--- disk (/tmp) ---'",
  "df -h /tmp 2>/dev/null || true",
  "echo '--- load ---'",
  "cat /proc/loadavg 2>/dev/null || true",
  "echo '--- top rss ---'",
  "(ps -eo pid,rss,stat,etime,args --sort=-rss 2>/dev/null | head -n 8) || true",
  "echo '--- done file ---'",
  "cat /tmp/run-design.done 2>/dev/null || echo '(missing: callback died without running its exit handler, e.g. SIGKILL/OOM)'",
  "echo; echo '--- callback log tail ---'",
  "tail -n 30 /tmp/design.log 2>/dev/null || true",
].join("; ");

/**
 * Read-only post-mortem for a session turn whose lease expired on a sandbox
 * that is still running. The sandbox is left running — this only reads
 * evidence (OOM lines, memory/swap, load, top processes, callback log) so the
 * stall can be root-caused without manual sandbox access. Never throws: a
 * failed capture must not block finalising the turn.
 */
export const captureStalledTurnDiagnostics = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      const diagnostics = await execHandle(
        sandbox,
        KILL_DIAGNOSTICS_COMMAND,
        15,
      );
      return diagnostics.trim().slice(0, 4000);
    } catch (error) {
      return `diagnostics capture failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

/**
 * Captures post-mortem diagnostics from a sandbox whose run was killed by the
 * watchdog, persists them on the run, then stops (not deletes) the sandbox.
 * Quick-task sandboxes are persistent — the paused filesystem keeps any
 * uncommitted work and unpushed commits recoverable, and the next run resumes
 * it. Capture is best-effort — the stop proceeds regardless.
 */
export const captureDiagnosticsAndStopSandbox = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    runId: v.id("agentRuns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      const diagnostics = await execHandle(
        sandbox,
        KILL_DIAGNOSTICS_COMMAND,
        15,
      );
      const trimmed = diagnostics.trim().slice(0, 4000);
      console.log(
        `[watchdog][diagnostics] runId=${args.runId} sandboxId=${args.sandboxId}\n${trimmed}`,
      );
      await ctx.runMutation(internal.taskWorkflow.appendRunLog, {
        runId: args.runId,
        message: `Sandbox diagnostics captured before stop:\n${trimmed}`,
      });
    } catch (error) {
      console.log(
        `[watchdog][diagnostics] runId=${args.runId} capture failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await ctx.runAction(internal.sandbox.stopSandbox, {
      sandboxId: args.sandboxId,
      repoId: args.repoId,
    });
    return null;
  },
});

/** Deletes a sandbox, silently ignoring already-deleted sandboxes. */
export const deleteSandbox = internalAction({
  args: { sandboxId: v.string(), repoId: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      await sandbox.delete();
    } catch {
      // Sandbox may already be deleted or expired
    }
    // Best-effort cleanup of the credential-helper row. No-op if absent.
    await ctx.runMutation(internal.sandboxGitCredentials.deleteBySandboxId, {
      sandboxId: args.sandboxId,
    });
    return null;
  },
});

/** Archives a sandbox (stops first if running, then moves to cold storage). */
export const archiveSandbox = internalAction({
  args: { sandboxId: v.string(), repoId: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      await sandbox.refresh();
      const state = sandbox.state;
      console.log(
        `[sandbox] Archiving sandbox ${args.sandboxId}, current state: ${state}`,
      );

      // Already archived - nothing to do
      if (state === "archived") {
        console.log(`[sandbox] Sandbox ${args.sandboxId} already archived`);
        return null;
      }

      // Stop first if currently running (archive requires stopped state)
      if (state === "running") {
        await releaseSwapFile(sandbox);
        await sandbox.stop();
        console.log(`[sandbox] Stopped sandbox ${args.sandboxId}`);
      }

      await sandbox.archive();
      console.log(`[sandbox] Archived sandbox ${args.sandboxId}`);
    } catch (error) {
      // Sandbox may already be archived, stopped, or deleted
      console.warn(
        `[sandbox] Failed to archive sandbox ${args.sandboxId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

/** Returns the active sandbox provider for a repo (for workflow thaw id selection). Vercel is the only provider. */
export const getSandboxProviderKind = internalAction({
  args: { repoId: v.id("githubRepos") },
  returns: v.literal("vercel"),
  handler: async () => "vercel" as const,
});

/**
 * Provider for a snapshot config. Vercel is the only provider, so this
 * always resolves "vercel"; kept as an internalAction (name unchanged) since
 * it is still part of the public `internal.sandbox.*` surface.
 */
export const getSnapshotSandboxProviderKind = internalAction({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.literal("vercel"),
  handler: async () => "vercel" as const,
});
