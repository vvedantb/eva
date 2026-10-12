import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import {
  findMainChat,
  moveLegacyTranscriptPage,
} from "../_sessionChats/helpers";

/** Each session may read one 2 MiB page; 5 stays well under the 16 MiB limit. */
const SESSIONS_PER_BATCH = 5;
const DRAFTS_PER_BATCH = 200;

/**
 * The first `backfillSessionChats` run moved only messages and the queue onto
 * each Main chat. Inline cards (UI panels, HTML renders, env var requests) and
 * pre-chat composer drafts stayed on the session id, so the chat view (read by
 * chat id) hid them. This pass moves them.
 *
 * Self-scheduling by `_creationTime` cursor: first over sessions (each one's
 * leftover rows, paged by `moveLegacyTranscriptPage`), then over `drafts`
 * (indexed by user first, so other users' drafts need a table pass). Safe to
 * re-run. Sessions without a Main chat are skipped; `ensureMainChat` moves
 * their rows when they get one.
 *
 * Run once: `npx convex run _migrations/moveLegacyChatRows:moveLegacyChatRows`
 */
export const moveLegacyChatRows = internalMutation({
  args: { cursor: v.optional(v.number()) },
  returns: v.object({ processed: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const cursor = args.cursor;
    const base = ctx.db.query("sessions").order("asc");
    const sessions = await (
      cursor === undefined
        ? base
        : base.filter((q) => q.gt(q.field("_creationTime"), cursor))
    ).take(SESSIONS_PER_BATCH);

    for (const session of sessions) {
      const chat = await findMainChat(ctx.db, session._id);
      if (!chat) continue;
      const moved = await moveLegacyTranscriptPage(ctx, session._id, chat._id);
      if (!moved) {
        await ctx.scheduler.runAfter(
          0,
          internal._sessionChats.mutations.moveLegacyTranscript,
          { sessionId: session._id, chatId: chat._id },
        );
      }
    }

    const last = sessions[sessions.length - 1];
    const done = sessions.length < SESSIONS_PER_BATCH || last === undefined;
    if (done) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.moveLegacyChatRows.moveLegacySessionDrafts,
        {},
      );
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.moveLegacyChatRows.moveLegacyChatRows,
        { cursor: last._creationTime },
      );
    }
    return { processed: sessions.length, done };
  },
});

/** Gives every pre-chat session draft (no `chatId`) its session's Main chat. */
export const moveLegacySessionDrafts = internalMutation({
  args: { cursor: v.optional(v.number()) },
  returns: v.object({ processed: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const cursor = args.cursor;
    const base = ctx.db.query("drafts").order("asc");
    const drafts = await (
      cursor === undefined
        ? base
        : base.filter((q) => q.gt(q.field("_creationTime"), cursor))
    ).take(DRAFTS_PER_BATCH);

    for (const draft of drafts) {
      if (draft.kind !== "sessionChat" || draft.chatId !== undefined) continue;
      if (draft.sessionId === undefined) continue;
      const chat = await findMainChat(ctx.db, draft.sessionId);
      if (chat) await ctx.db.patch(draft._id, { chatId: chat._id });
    }

    const last = drafts[drafts.length - 1];
    const done = drafts.length < DRAFTS_PER_BATCH || last === undefined;
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.moveLegacyChatRows.moveLegacySessionDrafts,
        { cursor: last._creationTime },
      );
    }
    return { processed: drafts.length, done };
  },
});
