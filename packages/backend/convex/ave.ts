import { v } from "convex/values";
import { authMutation, authQuery } from "./functions";
import { aveMessageFields, aveThreadFields } from "./_validators/tableFields";
import { clearStreamingActivity } from "./_taskWorkflow/helpers";
import {
  findLiveThread,
  getOrCreateLiveThread,
  requestRun,
} from "./_ave/threads";

/**
 * Manager Ave's public API: one live thread per user, no repo, no sandbox, no
 * model choice. The run itself is `mcp/aveRun.ts`; everything here only reads
 * the thread or asks for a run through `requestRun`.
 */

const MAX_MESSAGE_CHARS = 20_000;
/** The chat shows the recent conversation; older rows stay in the table. */
const LIST_LIMIT = 200;

export const getThread = authQuery({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("aveThreads"),
      status: aveThreadFields.status,
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const thread = await findLiveThread(ctx.db, ctx.userId);
    return thread ? { _id: thread._id, status: thread.status } : null;
  },
});

export const listMessages = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("aveMessages"),
      _creationTime: v.number(),
      ...aveMessageFields,
    }),
  ),
  handler: async (ctx) => {
    const thread = await findLiveThread(ctx.db, ctx.userId);
    if (!thread) return [];
    const recent = await ctx.db
      .query("aveMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(LIST_LIMIT);
    // Replay payloads are model context, not chat content — never ship them.
    return recent
      .reverse()
      .map((row) => ({ ...row, modelMessages: undefined }));
  },
});

export const getStreaming = authQuery({
  args: {},
  returns: v.union(
    v.object({
      currentActivity: v.string(),
      currentContent: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const thread = await findLiveThread(ctx.db, ctx.userId);
    if (!thread || thread.status !== "running") return null;
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", String(thread._id)))
      .first();
    if (!streaming) return null;
    return {
      currentActivity: streaming.currentActivity,
      currentContent: streaming.currentContent,
    };
  },
});

export const send = authMutation({
  args: { content: v.string(), clientId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const content = args.content.trim();
    if (content === "") return null;
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new Error("Message is too long for Manager Ave");
    }
    const thread = await getOrCreateLiveThread(ctx, ctx.userId);
    await ctx.db.insert("aveMessages", {
      threadId: thread._id,
      role: "user",
      content,
      timestamp: Date.now(),
      userId: ctx.userId,
      clientId: args.clientId,
    });
    await requestRun(ctx, thread);
    return null;
  },
});

/** Stops the run in flight; it notices on its next progress write. */
export const cancel = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const thread = await findLiveThread(ctx.db, ctx.userId);
    if (!thread || thread.status !== "running") return null;
    await ctx.db.patch(thread._id, {
      cancelRequested: true,
      rerunRequested: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Starts Ave over. The old thread is archived, not deleted; its watches stop
 * waking anyone (`notifyOrchestratorOfChild` drops watches on archived
 * threads). A run in flight is fenced out: it can no longer write.
 */
export const reset = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const thread = await findLiveThread(ctx.db, ctx.userId);
    if (!thread) return null;
    const now = Date.now();
    await ctx.db.patch(thread._id, {
      archivedAt: now,
      status: "idle",
      runId: undefined,
      runMessageId: undefined,
      rerunRequested: undefined,
      cancelRequested: true,
      updatedAt: now,
    });
    await clearStreamingActivity(ctx, String(thread._id));
    return null;
  },
});
