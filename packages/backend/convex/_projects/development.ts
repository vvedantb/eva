import { v } from "convex/values";
import {
  authMutation,
  getRepoWithAccess,
  onProjectTasksChanged,
} from "../functions";
import { allocateNumId } from "../numId";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";

/**
 * Creates a new project from existing tasks, assigning them sequential task
 * numbers. Like `projects.create`, it plans in its coordinator chat.
 */
export const createFromTasks = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    title: v.string(),
    taskIds: v.array(v.id("agentTasks")),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    if (args.taskIds.length === 0) {
      throw new Error("At least one task is required");
    }
    const repo = await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const tasks = await Promise.all(args.taskIds.map((id) => ctx.db.get(id)));
    if (tasks.some((task) => task !== null && task.repoId !== args.repoId)) {
      throw new Error("Tasks must belong to this repository");
    }
    const projectNumId = await allocateNumId(ctx.db, args.repoId, "projects");
    const projectId = await ctx.db.insert("projects", {
      repoId: args.repoId,
      userId: ctx.userId,
      title: args.title,
      rawInput: args.title,
      baseBranch: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
      projectStartDate: Date.now(),
      numId: projectNumId,
    });
    for (let i = 0; i < args.taskIds.length; i++) {
      const taskId = args.taskIds[i];
      if (tasks[i]) {
        await ctx.db.patch(taskId, {
          projectId,
          taskNumber: i + 1,
          updatedAt: Date.now(),
        });
      }
    }
    await onProjectTasksChanged(ctx, projectId);
    return projectId;
  },
});
