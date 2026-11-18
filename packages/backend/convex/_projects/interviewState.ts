import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { projectInterviewValidator } from "../_validators/tableFields";
import { findOwnedSession, sessionOwnerProjectId } from "../_sessions/owner";

/**
 * A project's interview or spec workflow (`projects.interview`):
 *
 *   idle ──start──▶ started ──claim──▶ claimed ──prepare──▶ prepared
 *   started ──prepare──▶ started (the session was already `active`: the VM is the session's)
 *   started | claimed | prepared ──finish──▶ idle
 *
 * `undefined` is idle. The workflow holds the project from its start until it
 * releases the session's sandbox (`releaseInterview`), not just while its
 * agent turn is open: the claim, the prepare, the save and the release all
 * sit outside the turn. Every event but `start` names its workflow, so a
 * stopped workflow's late write is rejected.
 *
 * Every write of `interview` goes through this module.
 */
export type ProjectInterview = Infer<typeof projectInterviewValidator>;

export type ProjectInterviewSource = Pick<Doc<"projects">, "interview">;

/** The project's interview state; `undefined` is idle. */
export function projectInterviewState(
  project: ProjectInterviewSource,
): ProjectInterview | undefined {
  return project.interview;
}

/** The running interview or spec workflow, if one holds the project. */
export function projectInterviewWorkflowId(
  project: ProjectInterviewSource,
): string | undefined {
  return projectInterviewState(project)?.workflowId;
}

/** An interview or spec workflow holds the project (and its session's sandbox). */
export function isProjectInterviewing(
  project: ProjectInterviewSource,
): boolean {
  return projectInterviewState(project) !== undefined;
}

export type ProjectInterviewEvent =
  | { type: "start"; workflowId: string }
  | { type: "claim"; workflowId: string; sessionStartAttempt: number }
  | { type: "prepare"; workflowId: string; sandboxId: string }
  | { type: "finish"; workflowId: string | undefined };

export type ProjectInterviewTransition =
  | { ok: true; next: ProjectInterview | undefined }
  | { ok: false; reason: string };

const reject = (reason: string): ProjectInterviewTransition => ({
  ok: false,
  reason,
});
const to = (next: ProjectInterview | undefined): ProjectInterviewTransition => ({
  ok: true,
  next,
});

/** The transition table. Pure: callers own the side effects (workflows, sandboxes). */
export function nextProjectInterview(
  current: ProjectInterview | undefined,
  event: ProjectInterviewEvent,
): ProjectInterviewTransition {
  if (event.type === "start") {
    if (current) return reject("Project already has an interview running");
    return to({ state: "started", workflowId: event.workflowId });
  }
  if (!current) return reject("Project has no interview running");
  if (event.workflowId !== undefined && event.workflowId !== current.workflowId) {
    return reject("A newer interview owns the project");
  }
  switch (event.type) {
    /** The interview moved the session `closed` → `starting`: it owns that start. */
    case "claim":
      if (current.state !== "started") {
        return reject("Interview already claimed the session");
      }
      return to({
        state: "claimed",
        workflowId: current.workflowId,
        sessionStartAttempt: event.sessionStartAttempt,
      });
    /**
     * The VM is prepared, before its attach. On its own claim the interview
     * records it; on a session that was already `active` the VM is the
     * session's, so nothing changes.
     */
    case "prepare":
      if (current.state === "started") return to(current);
      if (current.state === "prepared") {
        return reject("Interview already prepared its sandbox");
      }
      return to({ ...current, state: "prepared", sandboxId: event.sandboxId });
    /** Released, or stopped. Without a `workflowId`, any interview ends. */
    case "finish":
      return to(undefined);
  }
}

/** Applies `event` to the stored project and writes the result (legacy fields cleared). */
async function applyProjectInterviewEvent(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  event: ProjectInterviewEvent,
): Promise<
  ProjectInterviewTransition & { previous: ProjectInterview | undefined }
> {
  const project = await ctx.db.get(projectId);
  if (!project) {
    return { ok: false, reason: "Project not found", previous: undefined };
  }
  const previous = projectInterviewState(project);
  const result = nextProjectInterview(previous, event);
  if (result.ok) {
    await ctx.db.patch(projectId, {
      interview: result.next,
    });
  }
  return { ...result, previous };
}

/**
 * The interview or spec workflow started. Callers check
 * `isProjectInterviewing` first, so a rejection throws and rolls the start back.
 */
export async function markProjectInterviewStarted(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string,
): Promise<void> {
  const result = await applyProjectInterviewEvent(ctx, projectId, {
    type: "start",
    workflowId,
  });
  if (!result.ok) throw new Error(result.reason);
}

/**
 * The interview claimed the session's start (`claimSandboxForTaskRun`). A
 * rejection throws, so a stopped workflow's claim rolls back with it and the
 * session never reads `starting` for a start nobody owns.
 */
export async function recordProjectInterviewClaim(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string,
  sessionStartAttempt: number,
): Promise<void> {
  const result = await applyProjectInterviewEvent(ctx, projectId, {
    type: "claim",
    workflowId,
    sessionStartAttempt,
  });
  if (!result.ok) throw new Error(result.reason);
}

/** Records the VM the interview prepared on its claim, before the attach. */
export async function recordProjectInterviewSandbox(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string,
  sandboxId: string,
): Promise<ProjectInterviewTransition> {
  return await applyProjectInterviewEvent(ctx, projectId, {
    type: "prepare",
    workflowId,
    sandboxId,
  });
}

/**
 * The interview released its sandbox, or was stopped. Returns the state it
 * left, so a stop can fail the start it claimed or stop the VM it prepared.
 */
export async function finishProjectInterview(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  workflowId: string | undefined,
): Promise<
  ProjectInterviewTransition & { previous: ProjectInterview | undefined }
> {
  return await applyProjectInterviewEvent(ctx, projectId, {
    type: "finish",
    workflowId,
  });
}

/**
 * Where an interview's agent turn is filed: under the project's session
 * (`entityId` and `sessionId`, lane `interview`), so the session's open-turn
 * reads see it. Null before the project has a session.
 */
export async function interviewTurnSessionId(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Id<"sessions"> | null> {
  return (await findOwnedSession(db, { kind: "project", projectId }))?._id ?? null;
}

/** The project an interview turn belongs to (`interviewTurnSessionId` in reverse). */
export async function interviewTurnProjectId(
  db: DatabaseReader,
  sessionId: Id<"sessions">,
): Promise<Id<"projects"> | undefined> {
  const session = await db.get(sessionId);
  return session ? sessionOwnerProjectId(session) : undefined;
}
