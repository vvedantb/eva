import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { projectBuildValidator } from "../_validators/tableFields";
import { findOwnedSession } from "../_sessions/owner";

/**
 * A project's build (`projects.build`), one field instead of three. Nothing
 * starts or schedules a build any more: project tasks start through Approve
 * and the project scheduler (`_projects/scheduler.ts`). This module only
 * winds down builds stored before that: a `running` build workflow until it
 * ends, and a `scheduled` build whose job still fires once
 * (`executeScheduledBuild`).
 *
 *   scheduled ──fire──▶ idle
 *   running ──finish──▶ idle (or scheduled, when a schedule waited behind it)
 *   idle ──start──▶ running (legacy; no caller starts a build)
 *
 * `undefined` is idle. A schedule stored behind a running build waits in
 * `running.scheduled`; if its job fires first, it is dropped. Which task the
 * build is on is not stored here: it is the project task whose own `run` is
 * `running` (`_agentTasks/runState.ts`).
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
