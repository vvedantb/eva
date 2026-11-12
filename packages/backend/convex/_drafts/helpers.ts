import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import { getSessionWithAccess, hasRepoAccess } from "../functions";
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

  if (target.kind === "sessionChat") {
    const session = await getSessionWithAccess(db, target.sessionId, userId);
    const { repoId } = session;
    const chatId = target.chatId;
    return {
      repoId,
      // One draft per chat tab: each tab is its own composer.
      findExisting: async () => {
        const rows = await db
          .query("drafts")
          .withIndex("by_user_and_chat", (q) =>
            q.eq("userId", userId).eq("chatId", chatId),
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
