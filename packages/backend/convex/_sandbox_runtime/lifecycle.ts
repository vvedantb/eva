"use node";

import { v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import { redactSecrets } from "@eva/shared/redactSecrets";
import type { DataModel, Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  execHandle,
  getRunningSandboxHandle,
  getSandboxHandle,
  KILL_PRIOR_AGENT_PROCESSES_CMD,
  withTimeout,
} from "./helpers";
import { releaseSwapFile } from "./swap";
import { isSandboxGoneError } from "./sandboxErrors";
import { CALLBACK_LIVENESS_COMMAND } from "./daemonPaths";
import { errorMessage } from "@vvedantb/server";

const STOP_SANDBOX_BUDGET_MS = 480_000;

const REFRESH_BUDGET_MS = 30_000;
const SWAP_RELEASE_BUDGET_MS = 150_000;
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
 * NOT kill on our inability to verify. The hard `TURN_BACKSTOP_MS` timeout (`handleStaleRun`)
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
    if (state !== "running") {
      return {
        alive: false,
        reason: "sandbox_not_started",
        sandboxState: state,
      };
    }

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
      const sandbox = await getRunningSandboxHandle(
        ctx,
        args.repoId,
        args.sandboxId,
      );
      if (sandbox) await execHandle(sandbox, KILL_PRIOR_AGENT_PROCESSES_CMD, 10);
    } catch {
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
              `[sandbox] stopSandbox refresh failed sandboxId=${args.sandboxId}: ${errorMessage(refreshError)}`,
            );
          }
          if (state === "running") {
            try {
              await withTimeout(
                releaseSwapFile(sandbox),
                SWAP_RELEASE_BUDGET_MS,
                `swap release ${args.sandboxId}`,
              );
            } catch (swapError) {
              console.log(
                `[sandbox] stopSandbox swap release failed sandboxId=${args.sandboxId}: ${errorMessage(swapError)}`,
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
      const message = errorMessage(error);
      const benign =
        isSandboxGoneError(error) ||
        (/already.?stopped|not found|does not exist|no active session|destroyed|gone/i.test(
          message,
        ) &&
          !/did not reach a terminal stopped state/i.test(message));
      if (benign) {
        console.log(
          `[sandbox] stopSandbox ignored benign error for ${args.sandboxId}: ${message}`,
        );
        return null;
      }
      console.error(
        `[sandbox] stopSandbox failed for ${args.sandboxId}: ${message}`,
      );
      throw error instanceof Error ? error : new Error(message);
    }
    return null;
  },
});

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

async function readKillDiagnostics(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  sandboxId: string,
): Promise<string> {
  const sandbox = await getRunningSandboxHandle(ctx, repoId, sandboxId);
  if (!sandbox) throw new Error("sandbox not running");
  const diagnostics = await execHandle(sandbox, KILL_DIAGNOSTICS_COMMAND, 15);
  return redactSecrets(diagnostics.trim()).slice(0, 4000);
}

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
      return await readKillDiagnostics(ctx, args.repoId, args.sandboxId);
    } catch (error) {
      return `diagnostics capture failed: ${errorMessage(error)}`;
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
      const trimmed = await readKillDiagnostics(
        ctx,
        args.repoId,
        args.sandboxId,
      );
      console.log(
        `[watchdog][diagnostics] runId=${args.runId} sandboxId=${args.sandboxId}\n${trimmed}`,
      );
      await ctx.runMutation(internal.taskWorkflow.appendRunLog, {
        runId: args.runId,
        message: `Sandbox diagnostics captured before stop:\n${trimmed}`,
      });
    } catch (error) {
      console.log(
        `[watchdog][diagnostics] runId=${args.runId} capture failed: ${errorMessage(error)}`,
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
    }
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

      if (state === "archived") {
        console.log(`[sandbox] Sandbox ${args.sandboxId} already archived`);
        return null;
      }

      if (state === "running") {
        await releaseSwapFile(sandbox);
        await sandbox.stop();
        console.log(`[sandbox] Stopped sandbox ${args.sandboxId}`);
      }

      await sandbox.archive();
      console.log(`[sandbox] Archived sandbox ${args.sandboxId}`);
    } catch (error) {
      console.warn(
        `[sandbox] Failed to archive sandbox ${args.sandboxId}: ${errorMessage(error)}`,
      );
    }
    return null;
  },
});
