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

/** The Eva chat that opened a PR, and the user it runs as. */
export type PrChat =
  | { kind: "session"; id: Id<"sessions">; numId?: number; userId: Id<"users"> }
  | { kind: "task"; id: Id<"agentTasks">; numId?: number; userId: Id<"users"> }
  | {
      kind: "project";
      id: Id<"projects">;
      numId?: number;
      userId: Id<"users">;
    };

/**
 * Finds the session, quick task or project whose PR this is. A session's
 * linked repos carry their own PR, and a quick task's PR lives on its run.
 */
export async function findChatForPrUrl(
  ctx: MutationCtx | QueryCtx,
  prUrl: string,
): Promise<PrChat | null> {
  const session =
    (await ctx.db
      .query("sessions")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", prUrl))
      .first()) ??
    (await ctx.db
      .query("sessionRepos")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", prUrl))
      .first()
      .then((linked) => (linked ? ctx.db.get(linked.sessionId) : null)));
  if (session) {
    return {
      kind: "session",
      id: session._id,
      numId: session.numId,
      userId: session.userId,
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
    };
  }

  return null;
}
