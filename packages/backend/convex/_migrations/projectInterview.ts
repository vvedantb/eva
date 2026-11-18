import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { isProjectInterviewing } from "../_projects/interviewState";
import { stopProjectInterview } from "../workflowWatchdog";

/**
 * Clears a project interview stuck after sandbox or agent failure: drops the
 * failed or empty assistant row, then stops the interview
 * (`stopProjectInterview`), which releases the project session's sandbox.
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

    const clearedWorkflow = isProjectInterviewing(project);
    await stopProjectInterview(ctx, args.projectId, undefined, {
      state: "cancelled",
      error: "Interview repaired",
    });

    return { clearedWorkflow, removedEmptyAssistant };
  },
});

/**
 * The gate for the narrowing PR that drops `projects` from
 * `turnEntityIdValidator`: turns (any lane, open or closed) still keyed by a
 * project id, and projects still on the legacy interview fields. Both must
 * be 0 after `dataMigrations:migrateProjectInterviewState`.
 * `npx convex run migrations:projectEntityTurnsLeft`
 */
export const projectEntityTurnsLeft = internalQuery({
  args: {},
  returns: v.object({
    turns: v.number(),
    openTurns: v.number(),
    legacyInterviewProjects: v.number(),
  }),
  handler: async (ctx) => {
    let turns = 0;
    let openTurns = 0;
    let legacyInterviewProjects = 0;
    for await (const project of ctx.db.query("projects")) {
      if (
        project.activeWorkflowId !== undefined ||
        project.interviewSandboxClaim !== undefined
      ) {
        legacyInterviewProjects++;
      }
      const keyed = await ctx.db
        .query("turns")
        .withIndex("by_entity_open", (q) => q.eq("entityId", project._id))
        .collect();
      turns += keyed.length;
      openTurns += keyed.filter((turn) => turn.open).length;
    }
    return { turns, openTurns, legacyInterviewProjects };
  },
});
