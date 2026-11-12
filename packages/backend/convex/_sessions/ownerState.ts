import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { findMainChat } from "../_sessionChats/helpers";
import {
  isProjectBuilding,
  type ProjectBuildSource,
} from "../_projects/buildState";
import {
  isProjectInterviewing,
  type ProjectInterviewSource,
} from "../_projects/interviewState";
import {
  findProjectSession,
  findProjectTaskChat,
  findTaskWorkSession,
  sessionOwnerProjectId,
  type OwnerChat,
  type OwnerEntity,
} from "./owner";

/**
 * Read-only owner lookups that need the chat and build modules. Kept apart
 * from the leaf `owner.ts`, which the schema validators import, so loading
 * the schema never pulls these modules into an import cycle.
 */

/**
 * The session chat a task or project talks in (a quick task's or project's
 * Main chat, a project task's own chat in its project's session), or null
 * until something needed it (`ensureOwnerChat`).
 */
export async function findOwnerChat(
  db: DatabaseReader,
  entity: OwnerEntity,
): Promise<OwnerChat | null> {
  const session =
    entity.kind === "task"
      ? await findTaskWorkSession(db, entity.task)
      : await findProjectSession(db, entity.project._id);
  if (!session) return null;
  const chat =
    entity.kind === "task" && entity.task.projectId !== undefined
      ? await findProjectTaskChat(db, entity.task._id)
      : await findMainChat(db, session._id);
  return chat ? { session, chat } : null;
}

/**
 * Whether a project's own work holds its session's sandbox outside any chat
 * turn: a build (all its tasks, gaps between them included) or the interview
 * / spec workflow (from its claim to its release; its agent turn alone is
 * filed under the session and counts as an open turn). The one source the
 * busy gates and the idle pause read for that hold; runs and chats hold it
 * through their open turns.
 */
export function projectHoldsSession(
  project: ProjectBuildSource & ProjectInterviewSource,
): boolean {
  return isProjectBuilding(project) || isProjectInterviewing(project);
}

/** `projectHoldsSession` for a session's owner; false for other owners. */
export async function ownerHoldsSession(
  db: DatabaseReader,
  session: Pick<Doc<"sessions">, "owner">,
): Promise<boolean> {
  const projectId = sessionOwnerProjectId(session);
  const project = projectId ? await db.get(projectId) : null;
  return project !== null && projectHoldsSession(project);
}
