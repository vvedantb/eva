import { v } from "convex/values";
import { bucketProjectProgress } from "@eva/shared/projectProgress";
import { authQuery, hasRepoAccess } from "../functions";

const chartTaskValidator = v.object({
  id: v.id("agentTasks"),
  numId: v.optional(v.number()),
  title: v.string(),
});

const chartDayValidator = v.object({
  start: v.number(),
  shipped: v.array(v.id("agentTasks")),
  archived: v.array(v.id("agentTasks")),
  open: v.number(),
});

/**
 * The Project page's 30-day progress chart: per local day, the tasks that
 * shipped and the ones archived without shipping, and how many were open at
 * the day's end (`bucketProjectProgress`). Drafts are not work yet, so they
 * are left out. `tasks` names every task a day lists. Reads the project's
 * tasks once; a project holds tens of tasks, not thousands.
 */
export const progressChart = authQuery({
  args: {
    projectId: v.id("projects"),
    tzOffsetMinutes: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      days: v.array(chartDayValidator),
      totals: v.object({
        shipped: v.number(),
        archived: v.number(),
        open: v.number(),
      }),
      tasks: v.array(chartTaskValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
      return null;
    }
    const tasks = (
      await ctx.db
        .query("agentTasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect()
    ).filter((task) => task.status !== "draft");
    const progress = bucketProjectProgress(
      tasks.map((task) => ({
        id: task._id,
        createdAt: task.createdAt,
        shippedAt: task.shippedAt,
        closedAt: task.closedAt,
      })),
      Date.now(),
      args.tzOffsetMinutes,
    );
    const listed = new Set(
      progress.days.flatMap((day) => [...day.shipped, ...day.archived]),
    );
    return {
      ...progress,
      tasks: tasks
        .filter((task) => listed.has(task._id))
        .map((task) => ({ id: task._id, numId: task.numId, title: task.title })),
    };
  },
});
