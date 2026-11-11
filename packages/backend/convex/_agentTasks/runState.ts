import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { taskRunValidator } from "../_validators/tableFields";
import { cancelScheduledFunction } from "../_scheduling/helpers";

/**
 * A task's own run (`agentTasks.run`), one field instead of four:
 *
 *   idle ──schedule──────▶ scheduled ──fire──▶ idle ──start──▶ running ──finish──▶ idle
 *   idle ──scheduleRetry─▶ retry_pending ──fire──▶ idle
 *   scheduled / retry_pending ──cancelSchedule──▶ idle
 *
 * `undefined` is idle. `start` from a schedule cancels its job. The task
 * chat (`activeChatWorkflowId`) and the kanban `status` are separate.
 *
 * Every write of `run` goes through this module, and each write clears the
 * legacy fields (`activeWorkflowId`, `scheduledAt`, `scheduledFunctionId`,
 * `scheduledRetryAt`). Reads go through `taskRunState`, which falls back to the
 * legacy fields for rows `migrateTaskRunState` has not reached yet.
 */
export type TaskRun = Infer<typeof taskRunValidator>;

export type TaskRunSource = Pick<
  Doc<"agentTasks">,
  "run" | "activeWorkflowId" | "scheduledAt" | "scheduledFunctionId"
>;

/**
 * The task's run state; `undefined` is idle. Legacy rows: a workflow id wins
 * over a schedule (see `migrateTaskRunState`), and a schedule needs both its
 * time and its job. 0e drops the fallback with the legacy fields.
 */
export function taskRunState(task: TaskRunSource): TaskRun | undefined {
  if (task.run !== undefined) return task.run;
  if (task.activeWorkflowId !== undefined) {
    return { state: "running", workflowId: task.activeWorkflowId };
  }
  if (
    task.scheduledAt !== undefined &&
    task.scheduledFunctionId !== undefined
  ) {
    return {
      state: "scheduled",
      at: task.scheduledAt,
      jobId: task.scheduledFunctionId,
    };
  }
  return undefined;
}

/** When the next scheduled or retry run fires, if one is pending. */
export function taskScheduledAt(task: TaskRunSource): number | undefined {
  const run = taskRunState(task);
  return run?.state === "scheduled" || run?.state === "retry_pending"
    ? run.at
    : undefined;
}

/** The running workflow, if the task's own run is in flight. */
export function taskRunWorkflowId(task: TaskRunSource): string | undefined {
  const run = taskRunState(task);
  return run?.state === "running" ? run.workflowId : undefined;
}

/** The task's own run is in flight (its chat turn is separate). */
export function isTaskRunning(task: TaskRunSource): boolean {
  return taskRunWorkflowId(task) !== undefined;
}

export type TaskRunEvent =
  | { type: "schedule"; at: number; jobId: Id<"_scheduled_functions"> }
  | { type: "scheduleRetry"; at: number; jobId: Id<"_scheduled_functions"> }
  | { type: "cancelSchedule" }
  | { type: "fire"; at: number | undefined; now: number }
  | { type: "start"; workflowId: string; runId: Id<"agentRuns"> }
  | { type: "finish"; runId: Id<"agentRuns"> | undefined };

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
  const state = current?.state ?? "idle";
  switch (event.type) {
    /**
     * A user schedule replaces any pending schedule or retry. Not while
     * running: the run's end decides what happens next.
     */
    case "schedule":
      if (state === "running") {
        return reject("Task already has an active execution");
      }
      return to({ state: "scheduled", at: event.at, jobId: event.jobId });
    /**
     * An automatic retry only fills an idle task: it never replaces a user
     * schedule or another retry, and never a newer run that already started.
     */
    case "scheduleRetry":
      if (state !== "idle") return reject(`Task is ${state}`);
      return to({ state: "retry_pending", at: event.at, jobId: event.jobId });
    case "cancelSchedule":
      if (state !== "scheduled" && state !== "retry_pending") {
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
    /**
     * Callers gate on `agentRuns` (`hasActiveRun`) first. A leftover
     * `running` here is replaced, as the legacy field was: rejecting it would
     * leave a started workflow untracked and block every later run.
     */
    case "start":
      return to({
        state: "running",
        workflowId: event.workflowId,
        runId: event.runId,
      });
    /**
     * Only the running run ends itself. A pending schedule or retry outlives
     * the run that set it, and a newer run keeps its own state.
     */
    case "finish":
      if (current?.state !== "running") return reject(`Task is ${state}`);
      if (
        event.runId !== undefined &&
        current.runId !== undefined &&
        current.runId !== event.runId
      ) {
        return reject("A newer run owns the task");
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
    await ctx.db.patch(taskId, {
      run: result.next,
      activeWorkflowId: undefined,
      scheduledAt: undefined,
      scheduledFunctionId: undefined,
      scheduledRetryAt: undefined,
    });
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
 * Schedules the task's run at `at`: a user `schedule` (replaces a pending
 * one) or an automatic `scheduleRetry` (only from idle). A rejected event
 * cancels the job it made.
 */
export async function scheduleTaskRun(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  type: "schedule" | "scheduleRetry",
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

/** The run's workflow started. A pending schedule it replaces is cancelled. */
export async function markTaskRunStarted(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  started: { workflowId: string; runId: Id<"agentRuns"> },
): Promise<void> {
  const result = await applyTaskRunEvent(ctx, taskId, {
    type: "start",
    ...started,
  });
  if (result.ok) await cancelJob(ctx, result.previous);
}

/**
 * The run ended (finished, cancelled, timed out or cleaned up). With a
 * `runId`, a newer run's state is left alone; without one, any run ends.
 */
export async function finishTaskRun(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  runId: Id<"agentRuns"> | undefined,
): Promise<void> {
  await applyTaskRunEvent(ctx, taskId, { type: "finish", runId });
}
