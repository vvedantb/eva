import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { projectBuildValidator } from "../_validators/tableFields";
import { cancelScheduledFunction } from "../_scheduling/helpers";
import { findOwnedSession } from "../_sessions/owner";

/**
 * A project's build (`projects.build`), one field instead of three:
 *
 *   idle ──schedule / scheduleRetry──▶ scheduled ──fire──▶ idle ──start──▶ running ──finish──▶ idle
 *   scheduled ──cancelSchedule──▶ idle
 *   scheduled ──start──▶ running (the schedule waits behind it)
 *   running ──schedule / scheduleRetry──▶ running + scheduled ──finish──▶ scheduled
 *
 * `undefined` is idle. A schedule set while a build runs (a usage-limit retry,
 * or a reschedule) waits in `running.scheduled`; its job stays live. If it
 * fires first, it is dropped, because a build is already running. Which task
 * the build is on is not stored here: it is the project task whose own `run`
 * is `running` (`_agentTasks/runState.ts`).
 *
 * Every write of `build` goes through this module.
 */
export type ProjectBuild = Infer<typeof projectBuildValidator>;
type ScheduledBuild = { at: number; jobId: Id<"_scheduled_functions"> };

export type ProjectBuildSource = Pick<Doc<"projects">, "build">;

/** The project's build state; `undefined` is idle. */
export function projectBuildState(
  project: ProjectBuildSource,
): ProjectBuild | undefined {
  return project.build;
}

/** The pending scheduled build, alone or behind a running one. */
function pendingSchedule(
  build: ProjectBuild | undefined,
): ScheduledBuild | undefined {
  if (build?.state === "scheduled") return { at: build.at, jobId: build.jobId };
  return build?.scheduled;
}

/** When the next scheduled build fires, if one is pending. */
export function projectScheduledBuildAt(
  project: ProjectBuildSource,
): number | undefined {
  return pendingSchedule(projectBuildState(project))?.at;
}

/** The running build workflow, if a build is in flight. */
export function projectBuildWorkflowId(
  project: ProjectBuildSource,
): string | undefined {
  const build = projectBuildState(project);
  return build?.state === "running" ? build.workflowId : undefined;
}

/** A build workflow is in flight. */
export function isProjectBuilding(project: ProjectBuildSource): boolean {
  return projectBuildWorkflowId(project) !== undefined;
}

export type ProjectBuildEvent =
  | { type: "schedule"; at: number; jobId: Id<"_scheduled_functions"> }
  | { type: "scheduleRetry"; at: number; jobId: Id<"_scheduled_functions"> }
  | { type: "cancelSchedule" }
  | { type: "fire"; at: number | undefined; now: number }
  | { type: "start"; workflowId: string }
  | { type: "finish"; workflowId: string | undefined };

export type ProjectBuildTransition =
  | { ok: true; next: ProjectBuild | undefined }
  | { ok: false; reason: string };

const reject = (reason: string): ProjectBuildTransition => ({
  ok: false,
  reason,
});
const to = (next: ProjectBuild | undefined): ProjectBuildTransition => ({
  ok: true,
  next,
});

/** `build` with its pending schedule set to `scheduled` (or removed). */
function withSchedule(
  build: ProjectBuild | undefined,
  scheduled: ScheduledBuild | undefined,
): ProjectBuild | undefined {
  if (build?.state === "running") return { ...build, scheduled };
  return scheduled && { state: "scheduled", ...scheduled };
}

/** The transition table. Pure: callers own the side effects (jobs, workflows). */
export function nextProjectBuild(
  current: ProjectBuild | undefined,
  event: ProjectBuildEvent,
): ProjectBuildTransition {
  const pending = pendingSchedule(current);
  switch (event.type) {
    /**
     * A user schedule replaces any pending one. Next to a running build it
     * waits behind it (`scheduleBuild` itself refuses a running project).
     */
    case "schedule":
      return to(withSchedule(current, { at: event.at, jobId: event.jobId }));
    /** An automatic usage-limit retry never replaces a pending schedule. */
    case "scheduleRetry":
      if (pending) return reject("Project already has a scheduled build");
      return to(withSchedule(current, { at: event.at, jobId: event.jobId }));
    case "cancelSchedule":
      if (!pending) return reject("Project has no scheduled build");
      return to(withSchedule(current, undefined));
    /**
     * The job fired. It only owns a schedule that is still pending, due, and
     * (when the job carries one) at the time it was scheduled for — a
     * reschedule leaves the old job stale. Behind a running build the
     * schedule is consumed without a new build.
     */
    case "fire":
      if (!pending) return reject("Project has no scheduled build");
      if (pending.at > event.now) return reject("Schedule is not due");
      if (event.at !== undefined && event.at !== pending.at) {
        return reject("Schedule was replaced");
      }
      return to(withSchedule(current, undefined));
    /** A pending schedule waits behind the new build, as it always did. */
    case "start":
      if (current?.state === "running") {
        return reject("Project already has an active build");
      }
      return to({
        state: "running",
        workflowId: event.workflowId,
        scheduled: pending,
      });
    /**
     * Only the running build ends itself; with a `workflowId`, only that
     * workflow. A schedule waiting behind it becomes the next build.
     */
    case "finish":
      if (current?.state !== "running") return reject("No active build");
      if (
        event.workflowId !== undefined &&
        event.workflowId !== current.workflowId
      ) {
        return reject("A newer build owns the project");
      }
      return to(withSchedule(undefined, current.scheduled));
  }
}

/** Applies `event` to the stored project and writes the result. */
async function applyProjectBuildEvent(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  event: ProjectBuildEvent,
): Promise<ProjectBuildTransition & { previous: ProjectBuild | undefined }> {
  const project = await ctx.db.get(projectId);
  if (!project) {
    return { ok: false, reason: "Project not found", previous: undefined };
  }
  const previous = projectBuildState(project);
  const result = nextProjectBuild(previous, event);
  if (result.ok) {
    await ctx.db.patch(projectId, { build: result.next });
  }
  return { ...result, previous };
}

/** Cancels the previous schedule's job when the new state no longer holds it. */
async function cancelDroppedJob(
  ctx: MutationCtx,
  previous: ProjectBuild | undefined,
  next: ProjectBuild | undefined,
): Promise<void> {
  const dropped = pendingSchedule(previous);
  if (dropped && dropped.jobId !== pendingSchedule(next)?.jobId) {
    await cancelScheduledFunction(ctx, dropped.jobId);
  }
}

/**
 * Schedules a build at `at`: a user `schedule` (replaces a pending one) or an
 * automatic `scheduleRetry` (only when none is pending). A rejected event
 * cancels the job it made.
 */
export async function scheduleProjectBuild(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  type: "schedule" | "scheduleRetry",
  at: number,
  /** A busy-session retry carries when the build was first due (`executeScheduledBuild`). */
  firstScheduledAt?: number,
): Promise<ProjectBuildTransition> {
  const jobId = await ctx.scheduler.runAt(
    at,
    internal.buildWorkflow.executeScheduledBuild,
    {
      projectId,
      scheduledAt: at,
      ...(firstScheduledAt !== undefined ? { firstScheduledAt } : {}),
    },
  );
  const result = await applyProjectBuildEvent(ctx, projectId, {
    type,
    at,
    jobId,
  });
  if (result.ok) await cancelDroppedJob(ctx, result.previous, result.next);
  else await ctx.scheduler.cancel(jobId);
  return result;
}

/** Cancels the pending schedule, using the job id the state holds. */
export async function cancelProjectBuildSchedule(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<ProjectBuildTransition> {
  const result = await applyProjectBuildEvent(ctx, projectId, {
    type: "cancelSchedule",
  });
  if (result.ok) await cancelDroppedJob(ctx, result.previous, result.next);
  return result;
}

/** The scheduled job is running: consumes its schedule if it still owns it. */
export async function fireProjectBuildSchedule(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  at: number | undefined,
): Promise<ProjectBuildTransition> {
  return applyProjectBuildEvent(ctx, projectId, {
    type: "fire",
    at,
    now: Date.now(),
  });
}

/**
 * The build workflow started. Callers check `isProjectBuilding` before they
 * start it, so a rejection throws and rolls the start back.
 */
export async function markProjectBuildStarted(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string,
): Promise<void> {
  const result = await applyProjectBuildEvent(ctx, projectId, {
    type: "start",
    workflowId,
  });
  if (!result.ok) throw new Error(result.reason);
}

/**
 * The build ended (finished, cancelled or stale). With a `workflowId`, a
 * newer build is left alone; without one, any build ends. Chat messages sent
 * during the build waited in the project session's queue
 * (`sessionChatHasFreeSlot`): they start now. Scheduled, since the queue
 * module imports this one.
 */
export async function finishProjectBuild(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string | undefined,
): Promise<ProjectBuildTransition> {
  const result = await applyProjectBuildEvent(ctx, projectId, {
    type: "finish",
    workflowId,
  });
  if (!result.ok) return result;
  const session = await findOwnedSession(ctx.db, {
    kind: "project",
    projectId,
  });
  if (session) {
    await ctx.scheduler.runAfter(
      0,
      internal._queues.helpers.drainQueueQuietly,
      { parentId: session._id },
    );
  }
  return result;
}
