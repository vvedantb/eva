import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";
import { deriveLogUsage } from "./_logs/usage";
import { pruneSettledBackgroundAgents } from "./_sessions/backgroundAgents";
import type { BackgroundAgentEntry } from "./_validators/tableFields";
import { MAX_THREAD_REPLIES } from "./_messages/replies";
import { joinThread } from "./_messages/threadParticipants";
import { teamMentionRecipients } from "./_mentions/mentionRecipients";
import { handProjectTriageToEva } from "./_migrations/handTriageToEva";
import { backfilledCloseTimes } from "./_agentTasks/closeTimes";
import { extraChatToDelete } from "./_migrations/deleteExtraSessionChats";

/**
 * Convex Migrations component — batched online migrations with progress,
 * resume, dry-run, and cancel. Prefer this over hand-rolled paginated
 * internalMutations for table-wide backfills.
 *
 * Hand-rolled one-offs still live under `_migrations/` and are re-exported
 * from `migrations.ts`. New table sweeps should `define` here instead.
 *
 * Docs: https://www.convex.dev/components/migrations
 *
 * Examples:
 *   export const setDefault = dataMigrations.define({
 *     table: "users",
 *     migrateOne: async (ctx, doc) => {
 *       if (doc.someField === undefined) {
 *         return { someField: "default" };
 *       }
 *     },
 *   });
 *
 *   npx convex run dataMigrations:setDefault '{dryRun: true}'
 *   npx convex run dataMigrations:setDefault
 *   npx convex run dataMigrations:run '{fn: "dataMigrations:setDefault"}'
 *   npx convex run --component migrations lib:getStatus --watch
 *   npx convex run --component migrations lib:cancel '{name: "dataMigrations:setDefault"}'
 */
// The second type argument is not optional here: `Migrations` defaults it to
// `void`, and `customRange` resolves its index field types through it.
export const dataMigrations = new Migrations<DataModel, typeof schema>(
  components.migrations,
  {
    migrationsLocationPrefix: "dataMigrations:",
    // Required by any `define` that sets `customRange` — the paginator needs
    // the schema to resolve the index it ranges over.
    schema,
  },
);

/** Generic runner: `npx convex run dataMigrations:run '{fn:"dataMigrations:…"}'`. */
export const run = dataMigrations.runner();

/** Moves large SKILL.md bodies out of rows read by repoSkills.listByRepo. */
export const splitRepoSkillContent = dataMigrations.define({
  table: "repoSkills",
  migrateOne: async (ctx, skill) => {
    if (!skill.content) return;
    const existing = await ctx.db
      .query("repoSkillContents")
      .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
      .unique();
    if (existing) {
      if (existing.content !== skill.content) {
        await ctx.db.patch(existing._id, { content: skill.content });
      }
    } else {
      await ctx.db.insert("repoSkillContents", {
        skillId: skill._id,
        content: skill.content,
      });
    }
    await ctx.db.patch(skill._id, { content: undefined });
  },
});

/** Backfills denormalised usage columns on logs rows written before they existed. */
export const backfillLogUsageFields = dataMigrations.define({
  table: "logs",
  migrateOne: async (_ctx, entry) => {
    if (entry.costUsd !== undefined || !entry.rawResultEvent) return;
    const usage = deriveLogUsage(entry.rawResultEvent);
    if (usage.costUsd === undefined) return;
    return usage;
  },
});

/**
 * Caps every stored `backgroundAgents` array at the settled-entry limit that
 * `mergeBackgroundAgents` now enforces on write. Small batches: an unpruned
 * row can hold several hundred KB, and a batch reads all of its rows at once.
 */
function pruneBackgroundAgentsPatch(doc: {
  backgroundAgents?: BackgroundAgentEntry[];
}): { backgroundAgents: BackgroundAgentEntry[] } | undefined {
  if (!doc.backgroundAgents) return;
  const pruned = pruneSettledBackgroundAgents(doc.backgroundAgents);
  if (pruned === doc.backgroundAgents) return;
  return { backgroundAgents: pruned };
}

const PRUNE_BACKGROUND_AGENTS_BATCH = 10;

export const pruneSessionChatBackgroundAgents = dataMigrations.define({
  table: "sessionChats",
  batchSize: PRUNE_BACKGROUND_AGENTS_BATCH,
  migrateOne: (_ctx, doc) => pruneBackgroundAgentsPatch(doc),
});

export const pruneSessionBackgroundAgents = dataMigrations.define({
  table: "sessions",
  batchSize: PRUNE_BACKGROUND_AGENTS_BATCH,
  migrateOne: (_ctx, doc) => pruneBackgroundAgentsPatch(doc),
});

/** `npx convex run --prod dataMigrations:pruneBackgroundAgents` */
export const pruneBackgroundAgents = dataMigrations.runner([
  internal.dataMigrations.pruneSessionChatBackgroundAgents,
  internal.dataMigrations.pruneSessionBackgroundAgents,
]);

/** Few chats per batch: one chat reads all its threads and their replies. */
const THREAD_PARTICIPANTS_BATCH = 5;

/**
 * Reply threads from before `threadParticipants` (notifications v2.5, part
 * A): each thread's root author, repliers and the people either mentions
 * become following participants, read up to now so no old thread shows
 * "N new". Idempotent: an existing row keeps its follow choice.
 *
 * `npx convex run --prod dataMigrations:backfillThreadParticipants`
 */
export const backfillThreadParticipants = dataMigrations.define({
  table: "sessionChats",
  batchSize: THREAD_PARTICIPANTS_BATCH,
  migrateOne: async (ctx, chat) => {
    const roots = await ctx.db
      .query("messages")
      .withIndex("by_parent_and_last_reply_at", (q) =>
        q.eq("parentId", chat._id).gt("lastReplyAt", 0),
      )
      .take(MAX_THREAD_REPLIES);
    const now = Date.now();
    for (const root of roots) {
      const replies = await ctx.db
        .query("messages")
        .withIndex("by_reply_to", (q) => q.eq("replyTo", root._id))
        .take(MAX_THREAD_REPLIES);
      const people = new Set<Id<"users">>();
      for (const message of [root, ...replies]) {
        if (message.role === "user" && message.userId !== undefined) {
          people.add(message.userId);
        }
        for (const userId of await teamMentionRecipients(
          ctx,
          message.content,
          chat.repoId,
          new Set(),
        )) {
          people.add(userId);
        }
      }
      for (const userId of people) {
        await joinThread(ctx, root._id, userId, now);
      }
    }
  },
});

/**
 * Projects have no Triage any more: every project task still waiting there
 * goes to the project's coordinator (Eva), which groups or starts it. One
 * wake per project; safe to re-run. Run once after the deploy:
 *
 *   npx convex run dataMigrations:handTriageToEva --prod
 */
export const handTriageToEva = dataMigrations.define({
  table: "projects",
  migrateOne: async (ctx, project) => {
    await handProjectTriageToEva(ctx, project);
  },
});

/**
 * Stamps `shippedAt` / `closedAt` on project tasks closed before the progress
 * chart existed (`backfilledCloseTimes`). Open or already stamped tasks are
 * left alone, so it is safe to re-run. Run once after the deploy:
 *
 *   npx convex run dataMigrations:backfillTaskCloseTimes --prod
 */
export const backfillTaskCloseTimes = dataMigrations.define({
  table: "agentTasks",
  migrateOne: async (ctx, task) => {
    if (task.projectId === undefined) return;
    return (await backfilledCloseTimes(ctx, task)) ?? undefined;
  },
});

/**
 * One chat per session: schedules the purge of every chat a session opened
 * beside its Main chat (`purgeExtraSessionChat`). A chat with an open turn is
 * skipped and logged; rerun once it has ended.
 */
export const deleteExtraSessionChatRows = dataMigrations.define({
  table: "sessionChats",
  migrateOne: async (ctx, chat) => {
    if (!(await extraChatToDelete(ctx, chat))) return;
    await ctx.scheduler.runAfter(
      0,
      internal._migrations.deleteExtraSessionChats.purgeExtraSessionChat,
      { chatId: chat._id },
    );
  },
});

/** A PR watch no longer names a session chat: it wakes the session's one chat. */
export const clearPrWatchSessionChat = dataMigrations.define({
  table: "pullRequests",
  migrateOne: (_ctx, row) => {
    if (row.watch?.sessionChatId === undefined) return;
    const { sessionChatId: _dropped, ...watch } = row.watch;
    return { watch };
  },
});

/**
 * Run once after the deploy that removes parallel chats:
 *
 *   npx convex run dataMigrations:deleteExtraSessionChats --prod
 */
export const deleteExtraSessionChats = dataMigrations.runner([
  internal.dataMigrations.deleteExtraSessionChatRows,
  internal.dataMigrations.clearPrWatchSessionChat,
]);
