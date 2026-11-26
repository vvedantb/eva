import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { taskBranchName } from "../_git/branchNames";
import {
  findPullRequestByUrl,
  recordPullRequest,
  type PrState,
} from "../_pullRequests/store";

/**
 * Links a PR opened for a task. Every task (a quick task or a project's child
 * task) owns its PR, and it becomes the task's primary: the PR of the branch
 * Eva works on. When the PR is already tracked its state is kept, and the
 * webhook corrects it within seconds.
 */
export async function recordTaskPullRequest(
  ctx: MutationCtx,
  args: {
    taskId: Id<"agentTasks">;
    prUrl: string;
    /** Initial state when the PR is not tracked yet. Defaults to draft. */
    state?: PrState;
  },
): Promise<void> {
  const task = await ctx.db.get(args.taskId);
  if (!task || task.repoId === undefined) return;
  const existing = await findPullRequestByUrl(ctx.db, args.prUrl);
  await recordPullRequest(ctx, {
    owner: { kind: "task", taskId: task._id },
    repoId: task.repoId,
    prUrl: args.prUrl,
    state: existing?.state ?? args.state ?? "draft",
    primary: true,
    origin: "eva",
    headBranch: taskBranchName(task),
    baseBranch: task.baseBranch,
    title: task.title,
  });
}

/** Links the PR the task chat or the Create PR action opened (`openTaskPr`). */
export const recordManualTaskPr = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    prUrl: v.string(),
    draft: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordTaskPullRequest(ctx, {
      taskId: args.taskId,
      prUrl: args.prUrl,
      state: args.draft ? "draft" : "open",
    });
    return null;
  },
});
