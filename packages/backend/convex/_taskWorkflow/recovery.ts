import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { cancelTrackedWorkflow } from "../workflowManager";
import type { Id } from "../_generated/dataModel";
import {
  clearStreamingActivity,
  getTaskRunStreamingEntityId,
  snapshotStreamingActivityToLog,
} from "./helpers";

const QUICK_TASK_AUTO_RETRY_BASE_DELAY_MS = 20_000;
const QUICK_TASK_AUTO_RETRY_JITTER_MS = 20_000;

// Staleness thresholds live in ./staleness (pure module shared with the
// session watchdog); re-exported here so existing importers keep working.
export {
  STALE_THRESHOLD_MS,
  STALE_CHECK_DELAY_MS,
  STALE_RECHECK_MS,
  STALE_FINISHING_THRESHOLD_MS,
  STALE_NO_SANDBOX_THRESHOLD_MS,
  STALE_UNVERIFIED_KILL_THRESHOLD_MS,
} from "./staleness";

/** Checks whether an error message indicates a sandbox infrastructure/network issue. */
export function isDaytonaNetworkIssue(errorMsg: string): boolean {
  const message = errorMsg.toLowerCase();
  if (
    message.includes("failed to fetch latest base branch") ||
    message.includes("daytona:fetchbasebranch")
  ) {
    return false;
  }
  const networkMarkers = [
    "network",
    "fetch failed",
    "econnreset",
    "econnrefused",
    "etimedout",
    "enotfound",
    "getaddrinfo",
    "socket hang up",
    "timeout",
    "timed out",
    "aborted",
  ];
  const daytonaMarkers = ["daytona", "daytonaerror", "sandbox", "snapshot"];
  const daytonaStatusMarkers = [
    "status code 408",
    "status code 429",
    "status code 500",
    "status code 502",
    "status code 503",
    "status code 504",
  ];

  const hasDaytonaMarker = daytonaMarkers.some((marker) =>
    message.includes(marker),
  );
  if (!hasDaytonaMarker) {
    return false;
  }

  if (
    message.includes("sandbox exec") ||
    message.includes("sandbox command failed")
  ) {
    return false;
  }

  const hasNetworkMarker = networkMarkers.some((marker) =>
    message.includes(marker),
  );
  const hasDaytonaStatusMarker = daytonaStatusMarkers.some((marker) =>
    message.includes(marker),
  );

  if (
    message.includes("sandbox failed to become ready within the timeout period")
  ) {
    return true;
  }

  return hasNetworkMarker || hasDaytonaStatusMarker;
}

// Usage-limit text parsing lives in ./usageLimitReset (pure module shared with
// the web app's recovery card); re-exported here so existing importers keep
// working, and so the web never pulls this module's workflow imports.
export { isUsageLimitError, parseUsageLimitResetTime } from "./usageLimitReset";

/** Calculates a randomized retry delay for quick task auto-retries. */
export function buildQuickTaskRetryDelayMs(): number {
  return (
    QUICK_TASK_AUTO_RETRY_BASE_DELAY_MS +
    Math.floor(Math.random() * QUICK_TASK_AUTO_RETRY_JITTER_MS)
  );
}

/** Cleans up a stale or failed run: cancels workflow, kills sandbox, marks run as error, and schedules retry. */
export async function cleanUpStaleRun(
  ctx: MutationCtx,
  params: {
    taskId: Id<"agentTasks">;
    runId: Id<"agentRuns">;
    sandboxId?: string;
    repoId?: Id<"githubRepos">;
    isProjectTask: boolean;
    errorMessage: string;
    exitReason: string;
    activeWorkflowId?: string;
    taskStatus: string;
  },
): Promise<void> {
  await cancelTrackedWorkflow(ctx, params.activeWorkflowId);

  if (params.sandboxId && params.repoId) {
    await ctx.scheduler.runAfter(0, internal.sandbox.killSandboxProcess, {
      sandboxId: params.sandboxId,
      repoId: params.repoId,
    });
    if (!params.isProjectTask) {
      // Quick-task sandboxes are persistent: stop (don't delete) so any
      // uncommitted work or unpushed commits stay recoverable and the next
      // run resumes the same filesystem. Diagnostics (dmesg OOM lines, done
      // file, callback log tail) are captured onto the run first, while the
      // sandbox is still running.
      await ctx.scheduler.runAfter(
        0,
        internal.sandbox.captureDiagnosticsAndStopSandbox,
        {
          sandboxId: params.sandboxId,
          repoId: params.repoId,
          runId: params.runId,
        },
      );
    }
  }

  await ctx.db.patch(params.runId, {
    status: "error",
    finalizingAt: undefined,
    error: params.errorMessage,
    finishedAt: Date.now(),
    exitReason: params.exitReason,
  });

  const taskPatch: {
    activeWorkflowId: undefined;
    updatedAt: number;
    status?: "todo";
    sandboxId?: string;
    reviewTaskSandboxStatus?: "closed";
  } = {
    activeWorkflowId: undefined,
    updatedAt: Date.now(),
    ...(params.taskStatus === "in_progress" ? { status: "todo" as const } : {}),
  };
  if (!params.isProjectTask && params.sandboxId) {
    // Keep the sandbox reference on the task (the run may have died before
    // saveTaskSandboxId ran, which would otherwise orphan the stopped
    // sandbox) and mark it closed so the reviewer UI shows a resumable,
    // stopped sandbox.
    taskPatch.sandboxId = params.sandboxId;
    taskPatch.reviewTaskSandboxStatus = "closed";
  }
  await ctx.db.patch(params.taskId, taskPatch);

  if (!params.isProjectTask) {
    await ctx.scheduler.runAfter(
      0,
      internal.taskWorkflow.maybeScheduleQuickTaskRetry,
      {
        taskId: params.taskId,
        runId: params.runId,
        error: params.errorMessage,
        delayMs: buildQuickTaskRetryDelayMs(),
      },
    );
  }

  const runStreamingEntityId = getTaskRunStreamingEntityId(params.runId);
  await snapshotStreamingActivityToLog(ctx, runStreamingEntityId, params.runId);
  await clearStreamingActivity(ctx, runStreamingEntityId);
  await clearStreamingActivity(ctx, String(params.taskId));
}
