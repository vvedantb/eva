import { v } from "convex/values";
import type { PaginationResult } from "convex/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { archiveSessionDoc } from "../_sessions/mutations";
import { isSessionArchived } from "../_sessions/archive";

/**
 * Clears the legacy fields and tables that no code reads or writes any more,
 * so a follow-up can drop them from the schema:
 *
 * - `users.orchestratorSessionId`: archives the pre-rebuild Manager Ave
 *   session it points at, deletes that session's queued wake-ups, then clears it.
 * - `sessions.isOrchestrator`, `sessions` / `agentTasks` / `projects`
 *   `.watchedByOrchestrator`, `queuedMessages.orchestratorNotification`,
 *   `routedMessages.mirroredMessageId`: cleared.
 * - `agentTasks.run` in `retry_pending`: becomes `scheduled` with the same
 *   time and job, which is how the old state behaved.
 * - `appSettings.sandboxIdleStop*`: copied into the `sandboxIdlePause*`
 *   fields when those are unset (the old read-time fallback), then cleared.
 * - `agentUsageLimits` rows with a legacy `repoId`, and every
 *   `sessionDaemonStates` and `taskSandboxEvents` row: deleted.
 *
 * Walks one table at a time, one page per mutation, and schedules the next
 * page. Safe to rerun: a clean row is a no-op.
 *
 * Run once per deployment, straight after the deploy:
 *   npx convex run _migrations/clearLegacyFields:clearLegacyFields
 */

const LEGACY_TABLES = [
  "users",
  "sessions",
  "agentTasks",
  "projects",
  "queuedMessages",
  "routedMessages",
  "appSettings",
  "agentUsageLimits",
  "sessionDaemonStates",
  "taskSandboxEvents",
] as const;

type LegacyTable = (typeof LEGACY_TABLES)[number];

const legacyTableValidator = v.union(
  ...LEGACY_TABLES.map((table) => v.literal(table)),
);

/** Small pages: session rows can be large, and a user row archives a session. */
const BATCH_SIZE = 25;

type PageResult = { isDone: boolean; continueCursor: string; changed: number };

async function sweep<T>(
  page: PaginationResult<T>,
  clear: (doc: T) => Promise<boolean>,
): Promise<PageResult> {
  let changed = 0;
  for (const doc of page.page) {
    if (await clear(doc)) changed++;
  }
  return { isDone: page.isDone, continueCursor: page.continueCursor, changed };
}

async function retireOrchestratorSession(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<boolean> {
  if (user.orchestratorSessionId === undefined) return false;
  const session = await ctx.db.get(user.orchestratorSessionId);
  if (session) {
    if (!isSessionArchived(session)) await archiveSessionDoc(ctx, session);
    // A wake-up queued behind the old master would otherwise drain into the
    // archived chat and restart its sandbox.
    const queued = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_created", (q) => q.eq("parentId", session._id))
      .collect();
    for (const row of queued) await ctx.db.delete(row._id);
  }
  await ctx.db.patch(user._id, { orchestratorSessionId: undefined });
  return true;
}

async function clearAppSettings(
  ctx: MutationCtx,
  row: Doc<"appSettings">,
): Promise<boolean> {
  if (
    row.sandboxIdleStopEnabled === undefined &&
    row.sandboxIdleStopMinutes === undefined
  ) {
    return false;
  }
  await ctx.db.patch(row._id, {
    sandboxIdlePauseMode:
      row.sandboxIdlePauseMode ??
      (row.sandboxIdleStopEnabled === false ? "off" : undefined),
    sandboxIdleAfterInteractionMinutes:
      row.sandboxIdleAfterInteractionMinutes ?? row.sandboxIdleStopMinutes,
    sandboxIdleStopEnabled: undefined,
    sandboxIdleStopMinutes: undefined,
  });
  return true;
}

async function clearPage(
  ctx: MutationCtx,
  table: LegacyTable,
  cursor: string | null,
): Promise<PageResult> {
  const opts = { cursor, numItems: BATCH_SIZE };
  switch (table) {
    case "users": {
      const page = await ctx.db.query("users").paginate(opts);
      return sweep(page, (user) => retireOrchestratorSession(ctx, user));
    }
    case "sessions": {
      const page = await ctx.db.query("sessions").paginate(opts);
      return sweep(page, async (session) => {
        if (
          session.isOrchestrator === undefined &&
          session.watchedByOrchestrator === undefined
        ) {
          return false;
        }
        await ctx.db.patch(session._id, {
          isOrchestrator: undefined,
          watchedByOrchestrator: undefined,
        });
        return true;
      });
    }
    case "agentTasks": {
      const page = await ctx.db.query("agentTasks").paginate(opts);
      return sweep(page, async (task) => {
        const run = task.run;
        if (run?.state === "retry_pending") {
          await ctx.db.patch(task._id, {
            watchedByOrchestrator: undefined,
            run: { state: "scheduled", at: run.at, jobId: run.jobId },
          });
          return true;
        }
        if (task.watchedByOrchestrator === undefined) return false;
        await ctx.db.patch(task._id, { watchedByOrchestrator: undefined });
        return true;
      });
    }
    case "projects": {
      const page = await ctx.db.query("projects").paginate(opts);
      return sweep(page, async (project) => {
        if (project.watchedByOrchestrator === undefined) return false;
        await ctx.db.patch(project._id, { watchedByOrchestrator: undefined });
        return true;
      });
    }
    case "queuedMessages": {
      const page = await ctx.db.query("queuedMessages").paginate(opts);
      return sweep(page, async (row) => {
        if (row.orchestratorNotification === undefined) return false;
        await ctx.db.patch(row._id, { orchestratorNotification: undefined });
        return true;
      });
    }
    case "routedMessages": {
      const page = await ctx.db.query("routedMessages").paginate(opts);
      return sweep(page, async (row) => {
        if (row.mirroredMessageId === undefined) return false;
        await ctx.db.patch(row._id, { mirroredMessageId: undefined });
        return true;
      });
    }
    case "appSettings": {
      const page = await ctx.db.query("appSettings").paginate(opts);
      return sweep(page, (row) => clearAppSettings(ctx, row));
    }
    case "agentUsageLimits": {
      const page = await ctx.db.query("agentUsageLimits").paginate(opts);
      return sweep(page, async (row) => {
        if (row.repoId === undefined) return false;
        await ctx.db.delete(row._id);
        return true;
      });
    }
    case "sessionDaemonStates": {
      const page = await ctx.db.query("sessionDaemonStates").paginate(opts);
      return sweep(page, async (row) => {
        await ctx.db.delete(row._id);
        return true;
      });
    }
    case "taskSandboxEvents": {
      const page = await ctx.db.query("taskSandboxEvents").paginate(opts);
      return sweep(page, async (row) => {
        await ctx.db.delete(row._id);
        return true;
      });
    }
  }
}

export const clearLegacyFields = internalMutation({
  args: {
    table: v.optional(legacyTableValidator),
    cursor: v.optional(v.string()),
    changed: v.optional(v.number()),
  },
  returns: v.object({ table: legacyTableValidator, done: v.boolean() }),
  handler: async (ctx, args) => {
    const table = args.table ?? LEGACY_TABLES[0];
    const page = await clearPage(ctx, table, args.cursor ?? null);
    const changed = (args.changed ?? 0) + page.changed;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.clearLegacyFields.clearLegacyFields,
        { table, cursor: page.continueCursor, changed },
      );
      return { table, done: false };
    }

    console.log(
      `[migration] clearLegacyFields: ${table} changed ${changed} rows`,
    );
    const next = LEGACY_TABLES[LEGACY_TABLES.indexOf(table) + 1];
    if (next === undefined) return { table, done: true };
    await ctx.scheduler.runAfter(
      0,
      internal._migrations.clearLegacyFields.clearLegacyFields,
      { table: next },
    );
    return { table, done: false };
  },
});
