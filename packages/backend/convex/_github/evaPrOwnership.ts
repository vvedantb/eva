import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

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
 * Finds the session, quick task or project whose PR this is. A session's
 * linked repos carry their own PR, and a quick task's PR lives on its run.
 */
export async function findChatForPrUrl(
  ctx: MutationCtx | QueryCtx,
  prUrl: string,
): Promise<PrChat | null> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_pr_url", (q) => q.eq("prUrl", prUrl))
    .first();
  if (session) {
    return {
      kind: "session",
      id: session._id,
      numId: session.numId,
      userId: session.userId,
      repoId: session.repoId,
    };
  }

  // A linked repo's PR belongs to the session, but its code to the linked repo.
  const linked = await ctx.db
    .query("sessionRepos")
    .withIndex("by_pr_url", (q) => q.eq("prUrl", prUrl))
    .first();
  const linkedSession = linked ? await ctx.db.get(linked.sessionId) : null;
  if (linked && linkedSession) {
    return {
      kind: "session",
      id: linkedSession._id,
      numId: linkedSession.numId,
      userId: linkedSession.userId,
      repoId: linked.repoId,
    };
  }

  const project = await ctx.db
    .query("projects")
    .withIndex("by_pr_url", (q) => q.eq("prUrl", prUrl))
    .first();
  if (project) {
    return {
      kind: "project",
      id: project._id,
      numId: project.numId,
      userId: project.userId,
      repoId: project.repoId,
    };
  }

  const run = await ctx.db
    .query("agentRuns")
    .withIndex("by_pr_url", (q) => q.eq("prUrl", prUrl))
    .first();
  const task = run ? await ctx.db.get(run.taskId) : null;
  if (task) {
    return {
      kind: "task",
      id: task._id,
      numId: task.numId,
      userId: task.createdBy,
      repoId: task.repoId,
    };
  }

  return null;
}
