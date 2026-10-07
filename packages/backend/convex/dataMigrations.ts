import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import schema from "./schema";
import { deriveLogUsage } from "./_logs/usage";
import { archiveSessionDoc } from "./_sessions/mutations";

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

/** Backfills compact task latest-run rows so list queries stop reading run logs. */
export const backfillAgentTaskRunSummaries = dataMigrations.define({
  table: "agentTasks",
  migrateOne: async (ctx, task) => {
    if (!task.repoId) return;
    const existing = await ctx.db
      .query("agentTaskRunSummaries")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .unique();
    if (existing) return;

    const latestRun = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .order("desc")
      .first();
    await ctx.db.insert("agentTaskRunSummaries", {
      taskId: task._id,
      repoId: task.repoId,
      lastRunStartedAt: latestRun?.startedAt,
    });
  },
});

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

/*
 * Manager Ave rebuild (Ave now lives in `aveThreads`). Run in order, then drop
 * the deprecated fields and delete these five:
 *   users.orchestratorSessionId, sessions.isOrchestrator,
 *   sessions/agentTasks/projects.watchedByOrchestrator,
 *   queuedMessages.orchestratorNotification
 */

/** Archives each pre-rebuild Ave session (stops its sandbox) and drops the pointer. */
export const retireOrchestratorSessions = dataMigrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (user.orchestratorSessionId === undefined) return;
    const session = await ctx.db.get(user.orchestratorSessionId);
    if (session) {
      if (session.archived !== true) await archiveSessionDoc(ctx, session);
      // A wake-up queued behind a busy old master would otherwise drain into
      // the archived chat and restart its sandbox.
      const queued = await ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_created", (q) =>
          q.eq("parentId", session._id),
        )
        .collect();
      for (const row of queued) await ctx.db.delete(row._id);
    }
    return { orchestratorSessionId: undefined };
  },
});

export const clearSessionOrchestratorFields = dataMigrations.define({
  table: "sessions",
  migrateOne: async (_ctx, session) => {
    if (
      session.isOrchestrator === undefined &&
      session.watchedByOrchestrator === undefined
    ) {
      return;
    }
    return { isOrchestrator: undefined, watchedByOrchestrator: undefined };
  },
});

export const clearTaskOrchestratorWatch = dataMigrations.define({
  table: "agentTasks",
  migrateOne: async (_ctx, task) => {
    if (task.watchedByOrchestrator === undefined) return;
    return { watchedByOrchestrator: undefined };
  },
});

export const clearProjectOrchestratorWatch = dataMigrations.define({
  table: "projects",
  migrateOne: async (_ctx, project) => {
    if (project.watchedByOrchestrator === undefined) return;
    return { watchedByOrchestrator: undefined };
  },
});

/** Drains the retired `turns.surface` label before the field is deleted. */
export const clearTurnSurface = dataMigrations.define({
  table: "turns",
  migrateOne: async (_ctx, turn) => {
    if (turn.surface === undefined) return;
    return { surface: undefined };
  },
});

/**
 * Drains the retired `pendingTurnClaimedAt` claim stamp (the durable turn's
 * lease replaced it) before the field is deleted. One per chat table.
 */
export const clearSessionPendingTurnClaimedAt = dataMigrations.define({
  table: "sessions",
  migrateOne: async (_ctx, row) => {
    if (row.pendingTurnClaimedAt === undefined) return;
    return { pendingTurnClaimedAt: undefined };
  },
});

export const clearTaskPendingTurnClaimedAt = dataMigrations.define({
  table: "agentTasks",
  migrateOne: async (_ctx, row) => {
    if (row.pendingTurnClaimedAt === undefined) return;
    return { pendingTurnClaimedAt: undefined };
  },
});

export const clearProjectPendingTurnClaimedAt = dataMigrations.define({
  table: "projects",
  migrateOne: async (_ctx, row) => {
    if (row.pendingTurnClaimedAt === undefined) return;
    return { pendingTurnClaimedAt: undefined };
  },
});

export const clearQueuedOrchestratorNotification = dataMigrations.define({
  table: "queuedMessages",
  migrateOne: async (_ctx, row) => {
    if (row.orchestratorNotification === undefined) return;
    return { orchestratorNotification: undefined };
  },
});
