import { v } from "convex/values";
import { authMutation, getProjectWithAccess } from "../functions";

/**
 * Kept so older clients still find it. Every child task now owns its PR and
 * resolves its own conflicts (`agentTasks.startExecution` with mode
 * `resolve_conflicts`); a project's old PR on the project branch takes no new
 * runs, so this always refuses.
 */
export const resolveProjectConflicts = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
      "contributor",
    );
    throw new Error(
      "A project's own PR takes no new runs. Resolve conflicts in the task whose PR has them.",
    );
  },
});
