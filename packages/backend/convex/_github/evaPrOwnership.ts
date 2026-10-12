import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { findPullRequestByUrl } from "../_pullRequests/store";

const EVA_BRANCH_PREFIXES = [
  "eva/task-",
  "eva/project-",
  "eva/session-",
  "eva/automation-",
] as const;

/**
 * True when this PR belongs to Eva-managed work (session / project / quick task
 * run). Those recaps live on the sandbox Review tab, not the docs Reviews list.
 */
export async function isEvaOwnedPullRequest(
  ctx: MutationCtx | QueryCtx,
  prUrl: string,
  branchName?: string,
): Promise<boolean> {
  if ((await findChatForPrUrl(ctx, prUrl)) !== null) return true;

  if (
    branchName !== undefined &&
    EVA_BRANCH_PREFIXES.some((prefix) => branchName.startsWith(prefix))
  ) {
    return true;
  }

  return false;
}

interface PrChatOwner {
  numId?: number;
  userId: Id<"users">;
  /** The app row the PR's code lives in; undefined for a repo-less task. */
  repoId?: Id<"githubRepos">;
}

/** The Eva chat that opened a PR, the user it runs as, and its app row. */
export type PrChat =
  | ({ kind: "session"; id: Id<"sessions"> } & PrChatOwner)
  | ({ kind: "task"; id: Id<"agentTasks"> } & PrChatOwner)
  | ({ kind: "project"; id: Id<"projects"> } & PrChatOwner);

/**
 * Finds the session, quick task or project whose PR this is, through its
 * `pullRequests` row. A linked repo's PR belongs to the session, but its code
 * to the linked repo, so `repoId` is the row's own repo.
 */
export async function findChatForPrUrl(
  ctx: MutationCtx | QueryCtx,
  prUrl: string,
): Promise<PrChat | null> {
  const row = await findPullRequestByUrl(ctx.db, prUrl);
  if (!row) return null;
  const owner = row.owner;

  if (owner.kind === "session") {
    const session = await ctx.db.get(owner.sessionId);
    if (!session) return null;
    return {
      kind: "session",
      id: session._id,
      numId: session.numId,
      userId: session.userId,
      repoId: row.repoId,
    };
  }

  if (owner.kind === "project") {
    const project = await ctx.db.get(owner.projectId);
    if (!project) return null;
    return {
      kind: "project",
      id: project._id,
      numId: project.numId,
      userId: project.userId,
      repoId: row.repoId,
    };
  }

  const task = await ctx.db.get(owner.taskId);
  if (!task) return null;
  return {
    kind: "task",
    id: task._id,
    numId: task.numId,
    userId: task.createdBy,
    repoId: row.repoId,
  };
}
