import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { upsertStreamingActivity } from "../streaming";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { AVE_CONTEXT_ROWS, type AveContextRow } from "./context";
import { buildAveInstructions } from "./prompt";
import { startRun } from "./threads";
import { roleValidator } from "../_validators/enums";

/**
 * Run-state mutations for one Manager Ave run (`mcp/aveRun.ts`). Every one is
 * fenced on `runId`: a run that was cancelled, reset, or reclaimed by the
 * watchdog can still be executing, and its late writes must land nowhere.
 */

/** The thread, but only while `runId` is still the run in flight. */
async function fencedThread(
  ctx: MutationCtx,
  threadId: Id<"aveThreads">,
  runId: string,
) {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.status !== "running" || thread.runId !== runId) {
    return null;
  }
  return thread;
}

const claimedRunValidator = v.object({
  messageId: v.id("aveMessages"),
  clerkUserId: v.string(),
  instructions: v.string(),
  rows: v.array(
    v.object({
      role: roleValidator,
      content: v.string(),
      isSystemAlert: v.optional(v.boolean()),
      modelMessages: v.optional(v.string()),
    }),
  ),
});

/** Opens the reply bubble and hands the action everything it needs to run. */
export const claimRun = internalMutation({
  args: { threadId: v.id("aveThreads"), runId: v.string() },
  returns: v.union(claimedRunValidator, v.null()),
  handler: async (ctx, args) => {
    const thread = await fencedThread(ctx, args.threadId, args.runId);
    if (!thread) return null;
    const user = await ctx.db.get(thread.userId);
    if (!user?.clerkId) return null;

    const recent = await ctx.db
      .query("aveMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(AVE_CONTEXT_ROWS);
    const rows: AveContextRow[] = recent.reverse().map((row) => ({
      role: row.role,
      content: row.content,
      isSystemAlert: row.isSystemAlert,
      modelMessages: row.modelMessages,
    }));

    await clearStreamingActivity(ctx, String(thread._id));
    const messageId = await ctx.db.insert("aveMessages", {
      threadId: thread._id,
      role: "assistant",
      content: "",
      activityLog: "",
      timestamp: Date.now(),
    });
    await ctx.db.patch(thread._id, { runMessageId: messageId });

    return {
      messageId,
      clerkUserId: user.clerkId,
      instructions: buildAveInstructions({
        now: new Date(),
        role: user.role,
        customInstructions: user.customInstructions,
      }),
      rows,
    };
  },
});

/**
 * Streams the partial reply and tool steps to the chat. Doubles as the cancel
 * poll, so the action learns about a Stop without a separate query.
 */
export const publishProgress = internalMutation({
  args: {
    threadId: v.id("aveThreads"),
    runId: v.string(),
    content: v.string(),
    activity: v.string(),
  },
  returns: v.object({ stop: v.boolean() }),
  handler: async (ctx, args) => {
    const thread = await fencedThread(ctx, args.threadId, args.runId);
    if (!thread) return { stop: true };
    await upsertStreamingActivity(ctx, {
      entityId: String(thread._id),
      currentActivity: args.activity,
      currentContent: args.content,
    });
    return { stop: thread.cancelRequested === true };
  },
});

/** Writes the reply, then either idles the thread or starts the follow-up run. */
async function settleRun(
  ctx: MutationCtx,
  threadId: Id<"aveThreads">,
  runId: string,
  result: {
    content: string;
    activityLog: string;
    modelMessages: string | undefined;
    error: string | undefined;
  },
): Promise<void> {
  const thread = await fencedThread(ctx, threadId, runId);
  if (!thread) return;
  const now = Date.now();

  if (thread.runMessageId !== undefined) {
    const placeholder = await ctx.db.get(thread.runMessageId);
    if (placeholder && placeholder.finishedAt === undefined) {
      if (result.content.trim() === "" && result.activityLog === "[]") {
        // Nothing to salvage: an empty bubble above the alert only adds noise.
        await ctx.db.delete(placeholder._id);
      } else {
        await ctx.db.patch(placeholder._id, {
          content: result.content,
          activityLog: result.activityLog,
          modelMessages: result.modelMessages,
          finishedAt: now,
        });
      }
    }
  }
  if (result.error !== undefined) {
    await ctx.db.insert("aveMessages", {
      threadId,
      role: "assistant",
      content: "Manager Ave hit an error and stopped.",
      errorDetail: result.error,
      isSystemAlert: true,
      timestamp: now,
      finishedAt: now,
    });
  }
  await clearStreamingActivity(ctx, String(threadId));

  // A Stop also drops whatever arrived mid-run: the user asked Ave to stand down.
  if (thread.rerunRequested === true && thread.cancelRequested !== true) {
    await startRun(ctx, threadId, now);
    return;
  }
  await ctx.db.patch(threadId, {
    status: "idle",
    runId: undefined,
    runStartedAt: undefined,
    runMessageId: undefined,
    rerunRequested: undefined,
    cancelRequested: undefined,
    updatedAt: now,
  });
}

export const finishRun = internalMutation({
  args: {
    threadId: v.id("aveThreads"),
    runId: v.string(),
    content: v.string(),
    activityLog: v.string(),
    modelMessages: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await settleRun(ctx, args.threadId, args.runId, {
      content: args.content,
      activityLog: args.activityLog,
      modelMessages: args.modelMessages,
      error: args.error,
    });
    return null;
  },
});

/**
 * Reclaims a run whose action crashed or hit the platform limit without
 * reaching `finishRun`. A run that did finish has already moved `runId` on, so
 * this is a no-op for it.
 */
export const watchdog = internalMutation({
  args: { threadId: v.id("aveThreads"), runId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", String(args.threadId)))
      .first();
    await settleRun(ctx, args.threadId, args.runId, {
      content: streaming?.currentContent ?? "",
      activityLog: streaming?.currentActivity ?? "[]",
      modelMessages: undefined,
      error: "The run stopped responding and was ended.",
    });
    return null;
  },
});
