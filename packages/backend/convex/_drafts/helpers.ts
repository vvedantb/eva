import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import { hasRepoAccess, hasSessionAccess } from "../functions";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { Infer } from "convex/values";
import { type draftTarget } from "../validators";

type DraftTarget = Infer<typeof draftTarget>;

/** Result returned by resolveTarget: the repoId for this surface and a function to find any existing draft row. */
type ResolvedTarget = {
  repoId: Id<"githubRepos">;
  findExisting: () => Promise<Doc<"drafts"> | null>;
};

/** Finds a user's draft row for a task comment, matched by taskId and parentCommentId. */
async function findTaskCommentDraft(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  taskId: Id<"agentTasks">,
  parentCommentId?: Id<"taskComments">,
): Promise<Doc<"drafts"> | null> {
  const rows = await db
    .query("drafts")
    .withIndex("by_user_and_task", (q) =>
      q.eq("userId", userId).eq("taskId", taskId),
    )
    .collect();
  return (
    rows.find(
      (d) => d.kind === "taskComment" && d.parentCommentId === parentCommentId,
    ) ?? null
  );
}

/** Finds a user's draft row for task sandbox chat, matched by taskId. */
async function findTaskChatDraft(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  taskId: Id<"agentTasks">,
): Promise<Doc<"drafts"> | null> {
  const rows = await db
    .query("drafts")
    .withIndex("by_user_and_task", (q) =>
      q.eq("userId", userId).eq("taskId", taskId),
    )
    .collect();
  return rows.find((d) => d.kind === "taskChat") ?? null;
}

/** Finds a user's draft row for project sandbox chat, matched by projectId. */
async function findProjectChatDraft(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  projectId: Id<"projects">,
): Promise<Doc<"drafts"> | null> {
  const rows = await db
    .query("drafts")
    .withIndex("by_user_and_project", (q) =>
      q.eq("userId", userId).eq("projectId", projectId),
    )
    .collect();
  return rows.find((d) => d.kind === "projectChat") ?? null;
}

/**
 * Validates that the surface doc exists, the user has repo access, and returns
 * the repoId plus a query helper to locate the matching draft row.
 *
 * Throws if the surface doc is missing or the user lacks access.
 */
export async function resolveTarget(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  target: DraftTarget,
): Promise<ResolvedTarget> {
  if (target.kind === "taskComment") {
    const task = await db.get(target.taskId);
    if (!task) throw new Error("Task not found");

    // Tasks may be repo-scoped or project-scoped; find the repoId either way.
    let repoId: Id<"githubRepos">;
    if (task.repoId) {
      repoId = task.repoId;
    } else if (task.projectId) {
      const project = await db.get(task.projectId);
      if (!project) throw new Error("Project not found");
      repoId = project.repoId;
    } else {
      throw new Error("Task has no repo or project");
    }

    if (!(await hasRepoAccess(db, repoId, userId))) {
      throw new Error("Not authorized");
    }

    const taskId = target.taskId;
    const parentCommentId = target.parentCommentId;

    return {
      repoId,
      findExisting: () =>
        findTaskCommentDraft(db, userId, taskId, parentCommentId),
    };
  }

  if (target.kind === "taskChat") {
    const task = await db.get(target.taskId);
    if (!task) throw new Error("Task not found");

    let repoId: Id<"githubRepos">;
    if (task.repoId) {
      repoId = task.repoId;
    } else if (task.projectId) {
      const project = await db.get(task.projectId);
      if (!project) throw new Error("Project not found");
      repoId = project.repoId;
    } else {
      throw new Error("Task has no repo or project");
    }

    if (!(await hasRepoAccess(db, repoId, userId))) {
      throw new Error("Not authorized");
    }

    const taskId = target.taskId;
    return {
      repoId,
      findExisting: () => findTaskChatDraft(db, userId, taskId),
    };
  }

  if (target.kind === "projectChat") {
    const project = await db.get(target.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(db, project.repoId, userId))) {
      throw new Error("Not authorized");
    }
    const { repoId } = project;
    const projectId = target.projectId;
    return {
      repoId,
      findExisting: () => findProjectChatDraft(db, userId, projectId),
    };
  }

  if (target.kind === "sessionChat") {
    const session = await db.get(target.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasSessionAccess(db, session, userId))) {
      throw new Error("Not authorized");
    }
    const { repoId } = session;
    const sessionId = target.sessionId;
    return {
      repoId,
      findExisting: async () => {
        const rows = await db
          .query("drafts")
          .withIndex("by_user_and_session", (q) =>
            q.eq("userId", userId).eq("sessionId", sessionId),
          )
          .collect();
        return rows[0] ?? null;
      },
    };
  }

  const _exhaustive: never = target;
  throw new Error(`Unsupported draft target kind: ${String(_exhaustive)}`);
}

/**
 * Deletes the draft row for a task comment, if one exists.
 * Called after a comment is successfully inserted so the draft is cleared.
 */
export async function deleteDraftForTarget(
  db: GenericDatabaseWriter<DataModel>,
  userId: Id<"users">,
  taskId: Id<"agentTasks">,
  parentCommentId?: Id<"taskComments">,
): Promise<void> {
  const row = await findTaskCommentDraft(db, userId, taskId, parentCommentId);
  if (row) {
    await db.delete(row._id);
  }
}
