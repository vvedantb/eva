import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  findMainChat,
  insertMainChat,
  moveLegacyTranscriptPage,
} from "../_sessionChats/helpers";
import { closeTurn } from "../_chat/turnStore";

/**
 * One action run stops after this long and reschedules itself, well inside
 * the 10 minute action limit.
 */
const BATCH_TIME_BUDGET_MS = 4 * 60 * 1000;

/**
 * Page cap for one session. Each page moves at least one row, so this only
 * trips on a runaway loop; the session is logged and skipped.
 */
const MAX_PAGES_PER_SESSION = 10_000;

/**
 * Gives every existing session a Main chat and moves its transcript onto it,
 * closes pre-chat "session" turns that nothing can renew any more, and
 * empties the legacy `sessionDaemonStates` mirror.
 *
 * Sessions run one at a time, in `_creationTime` order. Each session runs as
 * a chain of `backfillSessionStep` mutations that move a bounded page each,
 * so a heavy transcript never hits the 16 MiB read limit. A session that
 * still fails is logged and skipped; the cursor moves on. Safe to rerun from
 * the start: a migrated session costs a few indexed reads.
 *
 * Run once: `npx convex run _migrations/backfillSessionChats:backfillSessionChats`
 * Then drop `sessionDaemonStates` and the `sessions` members of the message
 * and turn validators.
 */
export const backfillSessionChats = internalAction({
  args: { cursor: v.optional(v.number()) },
  returns: v.object({
    processed: v.number(),
    failed: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const deadline = Date.now() + BATCH_TIME_BUDGET_MS;
    let cursor = args.cursor;
    let processed = 0;
    let failed = 0;

    while (Date.now() < deadline) {
      const next = await ctx.runQuery(
        internal._migrations.backfillSessionChats.nextSession,
        { cursor },
      );
      if (next === null) {
        console.log(
          `backfillSessionChats done: processed=${processed} failed=${failed}`,
        );
        return { processed, failed, done: true };
      }
      try {
        let pages = 0;
        let sessionDone = false;
        while (!sessionDone) {
          if (pages >= MAX_PAGES_PER_SESSION) {
            throw new Error(`gave up after ${MAX_PAGES_PER_SESSION} pages`);
          }
          sessionDone = await ctx.runMutation(
            internal._migrations.backfillSessionChats.backfillSessionStep,
            { sessionId: next.sessionId },
          );
          pages += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(
          `backfillSessionChats: session ${next.sessionId} failed, skipping`,
          error,
        );
      }
      processed += 1;
      cursor = next.creationTime;
    }

    console.log(
      `backfillSessionChats batch: processed=${processed} failed=${failed} cursor=${cursor}`,
    );
    await ctx.scheduler.runAfter(
      0,
      internal._migrations.backfillSessionChats.backfillSessionChats,
      { cursor },
    );
    return { processed, failed, done: false };
  },
});

/** The first session created after `cursor`, oldest first. */
export const nextSession = internalQuery({
  args: { cursor: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({ sessionId: v.id("sessions"), creationTime: v.number() }),
  ),
  handler: async (ctx, args) => {
    const cursor = args.cursor;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_creation_time", (q) =>
        cursor === undefined ? q : q.gt("_creationTime", cursor),
      )
      .first();
    if (!session) return null;
    return { sessionId: session._id, creationTime: session._creationTime };
  },
});

/**
 * One bounded step of one session's backfill. Returns true when the session
 * is fully migrated; false when transcript rows remain for the next step.
 */
export const backfillSessionStep = internalMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return true;
    const chat =
      (await findMainChat(ctx.db, session._id)) ??
      (await insertMainChat(ctx, session));
    if (!(await moveLegacyTranscriptPage(ctx, session._id, chat._id))) {
      return false;
    }

    const legacyTurns = await ctx.db
      .query("turns")
      .withIndex("by_entity_open", (q) =>
        q.eq("entityId", session._id).eq("lane", undefined).eq("open", true),
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
    return true;
  },
});
