import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { projectInterviewValidator } from "../_validators/tableFields";
import { findProjectSession, sessionOwnerProjectId } from "../_sessions/owner";

/**
 * A project's interview or spec workflow (`projects.interview`), one field
 * instead of two (`activeWorkflowId` + `interviewSandboxClaim`):
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

export type ProjectInterviewSource = Pick<
  Doc<"projects">,
  "interview" | "activeWorkflowId" | "interviewSandboxClaim"
>;

/**
 * The legacy fields as an interview state, until
 * `dataMigrations:migrateProjectInterviewState` has run. A claim without a
 * workflow (the old save cleared the workflow before the release) is idle:
 * the release still stops the VM it holds.
 */
export function legacyProjectInterview(
  project: ProjectInterviewSource,
): ProjectInterview | undefined {
  const workflowId = project.activeWorkflowId;
  if (workflowId === undefined) return undefined;
  const claim = project.interviewSandboxClaim;
  if (claim === undefined) return { state: "started", workflowId };
  const { sessionStartAttempt, sandboxId } = claim;
  return sandboxId === undefined
    ? { state: "claimed", workflowId, sessionStartAttempt }
    : { state: "prepared", workflowId, sessionStartAttempt, sandboxId };
}

/** The project's interview state; `undefined` is idle. */
export function projectInterviewState(
  project: ProjectInterviewSource,
): ProjectInterview | undefined {
  return project.interview ?? legacyProjectInterview(project);
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
      activeWorkflowId: undefined,
      interviewSandboxClaim: undefined,
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
 * reads see it. A turn opened before that change is keyed by the project.
 */
export async function interviewTurnEntityIds(
  db: DatabaseReader,
  projectId: Id<"projects">,
): Promise<Array<Id<"sessions"> | Id<"projects">>> {
  const session = await findProjectSession(db, projectId);
  return session ? [session._id, projectId] : [projectId];
}

/** The project an interview turn belongs to (`interviewTurnEntityIds` in reverse). */
export async function interviewTurnProjectId(
  db: DatabaseReader,
  entityId: Id<"sessions"> | Id<"projects">,
): Promise<Id<"projects"> | undefined> {
  const projectId = db.normalizeId("projects", entityId);
  if (projectId) return projectId;
  const sessionId = db.normalizeId("sessions", entityId);
  const session = sessionId ? await db.get(sessionId) : null;
  return session ? sessionOwnerProjectId(session) : undefined;
}
