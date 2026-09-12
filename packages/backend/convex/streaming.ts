import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authQuery, authMutation } from "./functions";
import { assertEntityAccess, hasEntityAccess } from "./_auth/entityAccess";
import { cancelledMessageOutcome } from "./_chat/cancelledMessage";

/**
 * Finalize an in-flight assistant message after the user hits stop.
 * Keeps whatever streamed text / tool timeline exists; deletes the bubble when
 * nothing was produced (avoids leaving "Execution cancelled by user.").
 */
export async function finalizeCancelledAssistantMessage(
  ctx: MutationCtx,
  message: Doc<"messages">,
  streaming: Doc<"streamingActivity"> | null,
): Promise<void> {
  const outcome = cancelledMessageOutcome(message, streaming);
  if (outcome.kind === "skip") return;
  if (outcome.kind === "delete") {
    await ctx.db.delete(message._id);
    return;
  }
  await ctx.db.patch(message._id, {
    ...(outcome.content !== undefined ? { content: outcome.content } : {}),
    ...(outcome.activityLog !== undefined
      ? { activityLog: outcome.activityLog }
      : {}),
    finishedAt: Date.now(),
  });
}

/** Overlapping heartbeat + flush both bump lastUpdatedAt; 2s is far below the 5-minute stale threshold. */
export const STREAMING_TOUCH_COALESCE_MS = 2_000;

export function shouldCoalesceStreamingTouch(
  lastUpdatedAt: number | undefined,
  now: number,
): boolean {
  if (lastUpdatedAt === undefined) return false;
  return now - lastUpdatedAt < STREAMING_TOUCH_COALESCE_MS;
}

const activityStateValidator = v.union(
  v.object({
    currentActivity: v.string(),
    currentContent: v.string(),
    pendingQuestion: v.optional(v.string()),
  }),
  v.null(),
);

const setArgs = {
  entityId: v.string(),
  currentActivity: v.string(),
  currentContent: v.optional(v.string()),
  pendingQuestion: v.optional(v.string()),
};

async function readStreamingActivity(ctx: QueryCtx, entityId: string) {
  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (!streaming) return null;
  return {
    currentActivity: streaming.currentActivity,
    currentContent: streaming.currentContent ?? "",
    pendingQuestion: streaming.pendingQuestion,
  };
}

/** Updates or creates streaming activity state for an entity, only writing on actual changes. */
export async function upsertStreamingActivity(
  ctx: MutationCtx,
  args: {
    entityId: string;
    currentActivity: string;
    currentContent?: string;
    pendingQuestion?: string;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
    .first();
  const now = Date.now();
  const nextContent = args.currentContent ?? "";
  if (existing) {
    const activityChanged = existing.currentActivity !== args.currentActivity;
    const contentChanged = (existing.currentContent ?? "") !== nextContent;
    const questionChanged =
      (existing.pendingQuestion ?? "") !== (args.pendingQuestion ?? "");
    if (activityChanged || contentChanged || questionChanged) {
      await ctx.db.patch(existing._id, {
        currentActivity: args.currentActivity,
        currentContent: nextContent,
        pendingQuestion: args.pendingQuestion,
        lastUpdatedAt: now,
      });
    } else if (!shouldCoalesceStreamingTouch(existing.lastUpdatedAt, now)) {
      await ctx.db.patch(existing._id, {
        lastUpdatedAt: now,
      });
    }
  } else {
    await ctx.db.insert("streamingActivity", {
      entityId: args.entityId,
      currentActivity: args.currentActivity,
      currentContent: nextContent,
      pendingQuestion: args.pendingQuestion,
      lastUpdatedAt: now,
    });
  }
}

/** Gets the current streaming activity state for an entity (task, session, etc.). */
export const get = authQuery({
  args: { entityId: v.string() },
  returns: activityStateValidator,
  handler: async (ctx, args) => {
    if (!(await hasEntityAccess(ctx.db, args.entityId, ctx.userId))) {
      return null;
    }
    return readStreamingActivity(ctx, args.entityId);
  },
});

/** Updates or creates streaming activity state for an entity, only writing on actual changes. */
export const set = authMutation({
  args: setArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertEntityAccess(ctx.db, args.entityId, ctx.userId);
    await upsertStreamingActivity(ctx, args);
    return null;
  },
});

/** Gets streaming activity state (internal use, no auth check). */
export const internalGet = internalQuery({
  args: { entityId: v.string() },
  returns: activityStateValidator,
  handler: async (ctx, args) => readStreamingActivity(ctx, args.entityId),
});

export async function touchStreamingEntity(
  ctx: MutationCtx,
  entityId: string,
): Promise<boolean> {
  const now = Date.now();
  const existing = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (!existing) {
    await ctx.db.insert("streamingActivity", {
      entityId,
      currentActivity: "[]",
      currentContent: "",
      lastUpdatedAt: now,
    });
    return true;
  }
  if (shouldCoalesceStreamingTouch(existing.lastUpdatedAt, now)) {
    return true;
  }
  await ctx.db.patch(existing._id, { lastUpdatedAt: now });
  return true;
}

/** Bumps lastUpdatedAt only — used for lightweight watchdog heartbeats (callback token). */
export const touch = authMutation({
  args: { entityId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await assertEntityAccess(ctx.db, args.entityId, ctx.userId);
    return touchStreamingEntity(ctx, args.entityId);
  },
});

/** Internal touch for HTTP heartbeat route and liveness probe refresh. */
export const internalTouch = internalMutation({
  args: { entityId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => touchStreamingEntity(ctx, args.entityId),
});

/** Updates or creates streaming activity state (internal use, no auth check). */
export const internalSet = internalMutation({
  args: setArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertStreamingActivity(ctx, args);
    return null;
  },
});

/** Removes the streaming activity record for an entity. */
export const clear = authMutation({
  args: { entityId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertEntityAccess(ctx.db, args.entityId, ctx.userId);
    const existing = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
