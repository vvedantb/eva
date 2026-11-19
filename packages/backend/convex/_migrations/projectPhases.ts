import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { recomputeProjectPhase } from "../functions";
import { isProjectBuilding } from "../_projects/buildState";
/** Maps legacy `active` project phase to the new lifecycle phases. */
export const migrateProjectPhases = internalMutation({
  args: {},
  returns: v.object({ projectsUpdated: v.number() }),
  handler: async (ctx) => {
    let projectsUpdated = 0;
    const projects = await ctx.db.query("projects").collect();

    for (const project of projects) {
      const phaseValue: string = project.phase;
      if (phaseValue !== "active") continue;

      const projectId = project._id;
      const hasBuilding = await ctx.db
        .query("agentTasks")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", projectId).eq("status", "todo"),
        )
        .first();
      const hasInProgress = await ctx.db
        .query("agentTasks")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", projectId).eq("status", "in_progress"),
        )
        .first();
      const hasCodeReview = await ctx.db
        .query("agentTasks")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", projectId).eq("status", "code_review"),
        )
        .first();

      let nextPhase: "in_progress" | "business_review" | "code_review" =
        "business_review";
      if (hasBuilding || hasInProgress) {
        nextPhase = "in_progress";
      } else if (hasCodeReview) {
        nextPhase = "code_review";
      }

      await ctx.db.patch(projectId, { phase: nextPhase });
      projectsUpdated++;
    }

    console.log(
      `[migration] migrateProjectPhases: updated ${projectsUpdated} projects`,
    );
    return { projectsUpdated };
  },
});

/** Recomputes phase for projects stuck in in_progress without an active build. */
export const repairStuckProjectPhases = internalMutation({
  args: {},
  returns: v.object({ projectsRepaired: v.number() }),
  handler: async (ctx) => {
    let projectsRepaired = 0;
    const projects = await ctx.db.query("projects").collect();

    for (const project of projects) {
      if (project.phase !== "in_progress") continue;
      if (isProjectBuilding(project)) continue;
      await recomputeProjectPhase(ctx, project._id);
      const updated = await ctx.db.get(project._id);
      if (updated?.phase !== "in_progress") {
        projectsRepaired++;
      }
    }

    console.log(
      `[migration] repairStuckProjectPhases: repaired ${projectsRepaired} projects`,
    );
    return { projectsRepaired };
  },
});
