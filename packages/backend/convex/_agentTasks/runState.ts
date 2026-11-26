import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { taskRunValidator } from "../_validators/tableFields";
import { cancelScheduledFunction } from "../_scheduling/helpers";

/**
 * A task's run schedule (`agentTasks.run`):
 *
 *   idle ──schedule──▶ scheduled ──fire──▶ idle
 *   scheduled / retry_pending ──cancelSchedule──▶ idle
 *
 * `undefined` is idle. A run itself is a task-mode chat turn
 * (`taskRunTurn.ts`); `retry_pending` is only left on old rows, and fires
 * like a schedule. The kanban `status` is separate.
 *
 * Every write of `run` goes through this module.
 */
export type TaskRun = Infer<typeof taskRunValidator>;

export type TaskRunSource = Pick<Doc<"agentTasks">, "run">;

/** The task's run state; `undefined` is idle. */
export function taskRunState(task: TaskRunSource): TaskRun | undefined {
  return task.run;
}

/** When the next scheduled or retry run fires, if one is pending. */
export function taskScheduledAt(task: TaskRunSource): number | undefined {
  const run = taskRunState(task);
  return run?.state === "scheduled" || run?.state === "retry_pending"
    ? run.at
    : undefined;
}

export type TaskRunEvent =
  | { type: "schedule"; at: number; jobId: Id<"_scheduled_functions"> }
  | { type: "cancelSchedule" }
  | { type: "fire"; at: number | undefined; now: number };

export type TaskRunTransition =
  | { ok: true; next: TaskRun | undefined }
  | { ok: false; reason: string };

const reject = (reason: string): TaskRunTransition => ({ ok: false, reason });
const to = (next: TaskRun | undefined): TaskRunTransition => ({
  ok: true,
  next,
});

/** The transition table. Pure: callers own the side effects (jobs, workflows). */
export function nextTaskRun(
  current: TaskRun | undefined,
  event: TaskRunEvent,
): TaskRunTransition {
  switch (event.type) {
    /** A user schedule replaces any pending schedule or retry. */
    case "schedule":
      return to({ state: "scheduled", at: event.at, jobId: event.jobId });
    case "cancelSchedule":
      if (current?.state !== "scheduled" && current?.state !== "retry_pending") {
        return reject("Task is not scheduled");
      }
      return to(undefined);
    /**
     * The job fired. It only owns a schedule that is still pending, due, and
     * (when the job carries one) at the time it was scheduled for — a
     * reschedule leaves the old job's run stale.
     */
    case "fire":
      if (
        current?.state !== "scheduled" &&
        current?.state !== "retry_pending"
      ) {
        return reject("Task is not scheduled");
      }
      if (current.at > event.now) return reject("Schedule is not due");
      if (event.at !== undefined && event.at !== current.at) {
        return reject("Schedule was replaced");
      }
      return to(undefined);
  }
}

/** Applies `event` to the stored task and writes the result. */
async function applyTaskRunEvent(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  event: TaskRunEvent,
): Promise<TaskRunTransition & { previous: TaskRun | undefined }> {
  const task = await ctx.db.get(taskId);
  if (!task)
    return { ok: false, reason: "Task not found", previous: undefined };
  const previous = taskRunState(task);
  const result = nextTaskRun(previous, event);
  if (result.ok) {
    await ctx.db.patch(taskId, { run: result.next });
  }
  return { ...result, previous };
}

async function cancelJob(
  ctx: MutationCtx,
  run: TaskRun | undefined,
): Promise<void> {
  if (run?.state === "scheduled" || run?.state === "retry_pending") {
    await cancelScheduledFunction(ctx, run.jobId);
  }
}

/**
 * Schedules the task's run at `at`, replacing a pending one. A rejected event
 * cancels the job it made.
 */
export async function scheduleTaskRun(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  type: "schedule",
  at: number,
): Promise<TaskRunTransition> {
  const jobId = await ctx.scheduler.runAt(
    at,
    internal.taskWorkflow.executeScheduledTask,
    { taskId, scheduledAt: at },
  );
  const result = await applyTaskRunEvent(ctx, taskId, { type, at, jobId });
  if (result.ok) {
    await cancelJob(ctx, result.previous);
    await ctx.db.patch(taskId, { updatedAt: Date.now() });
  } else {
    await ctx.scheduler.cancel(jobId);
  }
  return result;
}

/** Cancels a pending schedule or retry, using the job id the state holds. */
export async function cancelTaskRunSchedule(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<TaskRunTransition> {
  const result = await applyTaskRunEvent(ctx, taskId, {
    type: "cancelSchedule",
  });
  if (result.ok) await cancelJob(ctx, result.previous);
  return result;
}

/** The scheduled job is running: consumes its schedule if it still owns it. */
export async function fireTaskRunSchedule(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  at: number | undefined,
): Promise<TaskRunTransition> {
  return applyTaskRunEvent(ctx, taskId, {
    type: "fire",
    at,
    now: Date.now(),
  });
}
