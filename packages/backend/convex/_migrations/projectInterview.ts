import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";

/**
 * Clears a project interview stuck after sandbox or agent failure. The
 * interview's sandbox is the project session's: stop it there.
 */
export const repairStuckProjectInterview = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.object({
    clearedWorkflow: v.boolean(),
    removedEmptyAssistant: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return { clearedWorkflow: false, removedEmptyAssistant: false };
    }

    let removedEmptyAssistant = false;
    const details = await ctx.db
      .query("projectDetails")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (details) {
      const last = details.conversationHistory.at(-1);
      const trimmedContent = last?.content.trim();
      if (
        last?.role === "assistant" &&
        (trimmedContent === "" ||
          trimmedContent === JSON.stringify({ error: true }))
      ) {
        await ctx.db.patch(details._id, {
          conversationHistory: details.conversationHistory.slice(0, -1),
        });
        removedEmptyAssistant = true;
      }
    }

    await clearStreamingActivity(ctx, String(args.projectId));

    const clearedWorkflow = project.activeWorkflowId !== undefined;
    await ctx.db.patch(args.projectId, { activeWorkflowId: undefined });

    return { clearedWorkflow, removedEmptyAssistant };
  },
});
