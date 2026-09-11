import { v } from "convex/values";
import { authMutation, authQuery, hasRepoAccess } from "../functions";
import { proposedPlanFields } from "../validators";
import { findOpenSessionTurn } from "../_chat/turnStore";

const proposedPlanDocValidator = v.object({
  _id: v.id("proposedPlans"),
  _creationTime: v.number(),
  ...proposedPlanFields,
});

export function exitPlanCaptureKey(input: {
  toolUseId?: string;
  planMarkdown: string;
}): string {
  return input.toolUseId && input.toolUseId.length > 0
    ? `tool:${input.toolUseId}`
    : `plan:${input.planMarkdown}`;
}

/**
 * Daemon capture of an ExitPlanMode plan. Auth matches pendingQuestions:post
 * (sandbox CONVEX_TOKEN). Dedupes by captureKey so canUseTool + assistant
 * snapshot cannot insert the same plan twice.
 */
export const capture = authMutation({
  args: {
    entityId: v.string(),
    planMarkdown: v.string(),
    toolUseId: v.optional(v.string()),
    turnId: v.optional(v.string()),
  },
  returns: v.union(v.id("proposedPlans"), v.null()),
  handler: async (ctx, args) => {
    const planMarkdown = args.planMarkdown.trim();
    if (!planMarkdown) return null;
    // ENTITY_ID is the session Convex id on session daemons.
    const sessionId = ctx.db.normalizeId("sessions", args.entityId);
    if (!sessionId) return null;
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const captureKey = exitPlanCaptureKey({
      toolUseId: args.toolUseId,
      planMarkdown,
    });
    const existing = await ctx.db
      .query("proposedPlans")
      .withIndex("by_session_and_capture_key", (q) =>
        q.eq("sessionId", sessionId).eq("captureKey", captureKey),
      )
      .first();
    if (existing) {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        planMarkdown,
        updatedAt: now,
      });
      await ctx.db.patch(sessionId, {
        planContent: planMarkdown,
        updatedAt: now,
      });
      return existing._id;
    }

    const openTurn = await findOpenSessionTurn(ctx, sessionId);
    const requestedTurnId =
      args.turnId !== undefined && args.turnId.length > 0
        ? ctx.db.normalizeId("turns", args.turnId)
        : null;
    const turnId = requestedTurnId ?? openTurn?._id;
    const now = Date.now();
    const id = await ctx.db.insert("proposedPlans", {
      sessionId,
      ...(turnId !== undefined ? { turnId } : {}),
      ...(openTurn?.placeholderMessageId !== undefined
        ? { messageId: openTurn.placeholderMessageId }
        : {}),
      planMarkdown,
      captureKey,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(sessionId, {
      planContent: planMarkdown,
      updatedAt: now,
    });
    return id;
  },
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
