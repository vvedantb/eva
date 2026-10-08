import { v } from "convex/values";
import { authMutation, hasRepoAccess } from "./functions";

/** Git's own ref-name ceiling is well under this; the cap is just a guard. */
const BRANCH_MAX_CHARS = 255;

/**
 * The in-sandbox daemon reports the branch its worktree is actually on (see
 * `callback-src/runtime/branchWatcher.ts`). Distinct from the entity's
 * `branchName`, which is what Eva asked the sandbox to check out at boot.
 *
 * Deliberately patches `sandboxBranch` alone: a branch report is not user
 * activity, so bumping `updatedAt` / `lastSandboxActivity` here would reorder
 * every sidebar each time the watcher polls.
 */
export const reportBranch = authMutation({
  args: {
    target: v.union(
      v.object({ kind: v.literal("session"), sessionId: v.id("sessions") }),
      v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
      v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
    ),
    branch: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const branch = args.branch.trim().slice(0, BRANCH_MAX_CHARS);
    if (branch.length === 0) return null;
    const target = args.target;

    if (target.kind === "session") {
      const session = await ctx.db.get(target.sessionId);
      if (!session) throw new Error("Session not found");
      if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
      // One filesystem can be reported by several daemon processes, so the
      // unchanged case must cost nothing.
      if (session.sandboxBranch === branch) return null;
      await ctx.db.patch(target.sessionId, { sandboxBranch: branch });
      return null;
    }

    if (target.kind === "task") {
      const task = await ctx.db.get(target.taskId);
      if (!task) throw new Error("Task not found");
      if (
        !task.repoId ||
        !(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))
      ) {
        throw new Error("Not authorized");
      }
      if (task.sandboxBranch === branch) return null;
      await ctx.db.patch(target.taskId, { sandboxBranch: branch });
      return null;
    }

    const project = await ctx.db.get(target.projectId);
    if (!project) throw new Error("Project not found");
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (project.sandboxBranch === branch) return null;
    await ctx.db.patch(target.projectId, { sandboxBranch: branch });
    return null;
  },
});
