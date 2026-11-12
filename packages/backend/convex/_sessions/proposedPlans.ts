import { v } from "convex/values";
import { authMutation, authQuery, hasRepoAccess } from "../functions";
import { proposedPlanFields } from "../validators";

const proposedPlanDocValidator = v.object({
  _id: v.id("proposedPlans"),
  _creationTime: v.number(),
  ...proposedPlanFields,
});

export const listBySession = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(proposedPlanDocValidator),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return [];
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return [];
    return await ctx.db
      .query("proposedPlans")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const markImplemented = authMutation({
  args: {
    planId: v.id("proposedPlans"),
    implementationSessionId: v.optional(v.id("sessions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) return null;
    const session = await ctx.db.get(plan.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const now = Date.now();
    await ctx.db.patch(args.planId, {
      implementedAt: now,
      implementationSessionId:
        args.implementationSessionId ?? plan.sessionId,
      updatedAt: now,
    });
    return null;
  },
});
