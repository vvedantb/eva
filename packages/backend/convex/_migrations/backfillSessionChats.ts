import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { ensureMainChat } from "../_sessionChats/helpers";
import { closeTurn } from "../_chat/turnStore";

const SESSIONS_PER_BATCH = 10;

/**
 * Gives every existing session a Main chat and moves its transcript onto it
 * (`ensureMainChat`), closes pre-chat "session" turns that nothing can renew
 * any more, and empties the legacy `sessionDaemonStates` mirror.
 *
 * Self-scheduling by `_creationTime` cursor so one run never exceeds the
 * mutation limits on a large deployment. Safe to re-run: sessions that
 * already have a Main chat are skipped by `ensureMainChat`.
 *
 * Run once: `npx convex run _migrations/backfillSessionChats:backfillSessionChats`
 * Then drop `sessionDaemonStates` and the `sessions` members of the message
 * and turn validators.
 */
export const backfillSessionChats = internalMutation({
  args: { cursor: v.optional(v.number()) },
  returns: v.object({ processed: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const cursor = args.cursor;
    const base = ctx.db.query("sessions").order("asc");
    const sessions = await (cursor === undefined
      ? base
      : base.filter((q) => q.gt(q.field("_creationTime"), cursor))
    ).take(SESSIONS_PER_BATCH);

    for (const session of sessions) {
      await ensureMainChat(ctx, session);
      const legacyTurns = await ctx.db
        .query("turns")
        .withIndex("by_entity_open", (q) =>
          q
            .eq("surface", "session")
            .eq("entityId", String(session._id))
            .eq("open", true),
        )
        .collect();
      for (const turn of legacyTurns) {
        await closeTurn(ctx, turn, "error", {
          error: "Closed by the session chats migration",
        });
      }
      const daemonState = await ctx.db
        .query("sessionDaemonStates")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const row of daemonState) {
        await ctx.db.delete(row._id);
      }
    }

    const last = sessions[sessions.length - 1];
    const done = sessions.length < SESSIONS_PER_BATCH || last === undefined;
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.backfillSessionChats.backfillSessionChats,
        { cursor: last._creationTime },
      );
    }
    return { processed: sessions.length, done };
  },
});
