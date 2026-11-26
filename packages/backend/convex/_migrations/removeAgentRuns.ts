import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { findWorkChat } from "../_sessions/ownerState";
import { hasTaskRunTurn } from "../_agentTasks/taskRunStatus";
import { DEFAULT_AI_MODEL } from "../_validators/aiModels";

const PAGE_SIZE = 25;

/**
 * Phase 2b, step 1: empties `agentRuns` and `agentRunActivityLogs` so the
 * run code, tables and fields can be dropped (step 2). Task runs are chat
 * turns now (`_agentTasks/taskRunTurn.ts`).
 *
 * Per task, before its runs go:
 * - Its latest settled run becomes a closed task-mode turn in its chat, when
 *   it has no task-mode turn yet. That turn is what the scheduler, the
 *   failed-run badge and `takesProjectSettings` read
 *   (`lastTaskRunOutcome`), so a failed or stopped project task stays held
 *   instead of restarting. Rows sort by insert time, so a quick task whose
 *   chat moved on after that run (a later reply turn) is left without one: it
 *   would read as failed above a newer reply. A project task always gets it:
 *   restarting a halted task is worse than a stale badge.
 * - Every `messages.runId`, `pullRequests` owner `runId` and `task.run` in
 *   the `running` state is cleared.
 *
 * Pages through every task, scheduling itself; safe to run again. Delete
 * this file in step 2, once it has run in dev and prod.
 */
export const removeAgentRuns = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    converted: v.optional(v.number()),
    deleted: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("agentTasks")
      .paginate({ cursor: args.cursor ?? null, numItems: PAGE_SIZE });
    let converted = args.converted ?? 0;
    let deleted = args.deleted ?? 0;
    for (const task of page.page) {
      const result = await clearTaskRuns(ctx, task);
      if (result.converted) converted += 1;
      deleted += result.deleted;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.removeAgentRuns.removeAgentRuns,
        { cursor: page.continueCursor, converted, deleted },
      );
      return null;
    }
    // Rows whose task is gone: nothing reads them; delete them too.
    await ctx.scheduler.runAfter(
      0,
      internal._migrations.removeAgentRuns.removeOrphanRunRows,
      {},
    );
    console.log(
      `[removeAgentRuns] tasks done: ${converted} runs became turns, ${deleted} runs deleted`,
    );
    return null;
  },
});

/** Deletes run and activity-log rows that no task holds, a page at a time. */
export const removeOrphanRunRows = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const runs = await ctx.db.query("agentRuns").take(PAGE_SIZE * 4);
    const logs = await ctx.db.query("agentRunActivityLogs").take(PAGE_SIZE * 4);
    for (const row of [...runs, ...logs]) await ctx.db.delete(row._id);
    if (runs.length > 0 || logs.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.removeAgentRuns.removeOrphanRunRows,
        {},
      );
    } else {
      console.log("[removeAgentRuns] done: no run rows left");
    }
    return null;
  },
});

async function clearTaskRuns(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<{ converted: boolean; deleted: number }> {
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  const converted =
    runs.length > 0 && (await convertLatestRun(ctx, task, runs));
  for (const run of runs) {
    const logs = await ctx.db
      .query("agentRunActivityLogs")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    for (const log of logs) await ctx.db.delete(log._id);
    if (run.replyMessageId) {
      const reply = await ctx.db.get(run.replyMessageId);
      if (reply) {
        await ctx.db.patch(reply._id, { runId: undefined });
        const prompts = await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", reply.parentId))
          .filter((q) => q.eq(q.field("runId"), run._id))
          .collect();
        for (const row of prompts) {
          await ctx.db.patch(row._id, { runId: undefined });
        }
      }
    }
    await ctx.db.delete(run._id);
  }
  const prs = await ctx.db
    .query("pullRequests")
    .withIndex("by_task", (q) => q.eq("owner.taskId", task._id))
    .collect();
  for (const pr of prs) {
    if (pr.owner.kind === "session" || pr.owner.runId === undefined) continue;
    // Rebuilt without the field: a nested `undefined` is not a removal.
    const { runId, ...owner } = pr.owner;
    void runId;
    await ctx.db.patch(pr._id, { owner });
  }
  if (task.run?.state === "running") {
    await ctx.db.patch(task._id, { run: undefined });
  }
  return { converted, deleted: runs.length };
}

/** Writes the task's latest settled run as a closed task-mode turn; see above. */
async function convertLatestRun(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  runs: Doc<"agentRuns">[],
): Promise<boolean> {
  if (await hasTaskRunTurn(ctx.db, task)) return false;
  const latest = [...runs]
    .filter((run) => run.status !== "queued" && run.status !== "running")
    .sort(
      (a, b) =>
        (b.startedAt ?? b._creationTime) - (a.startedAt ?? a._creationTime),
    )[0];
  if (!latest) return false;
  const owned = await findWorkChat(ctx.db, { kind: "task", task });
  if (!owned) return false;
  const startedAt = latest.startedAt ?? latest._creationTime;
  if (task.projectId === undefined) {
    const later = await ctx.db
      .query("turns")
      .withIndex("by_session_open", (q) =>
        q.eq("sessionId", owned.session._id).eq("open", false),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("lane"), undefined),
          q.gt(q.field("turnStartedAt"), startedAt),
        ),
      )
      .first();
    if (later) return false;
  }
  const finishedAt = latest.finishedAt ?? startedAt;
  // The run's reply row (runs since they wrote chat rows) carries the usage
  // limit the scheduler reads.
  const reply = latest.replyMessageId
    ? await ctx.db.get(latest.replyMessageId)
    : null;
  if (reply && latest.errorType === "rate_limit") {
    await ctx.db.patch(reply._id, {
      errorType: "rate_limit",
      limitResetAt: latest.limitResetAt,
    });
  }
  await ctx.db.insert("turns", {
    entityId: owned.chat._id,
    sessionId: owned.session._id,
    streamingEntityId: String(owned.chat._id),
    state:
      latest.status === "success"
        ? "done"
        : latest.status === "cancelled"
          ? "cancelled"
          : "error",
    open: false,
    turnStartedAt: startedAt,
    finishedAt,
    leaseExpiresAt: finishedAt,
    leaseGeneration: 0,
    ...(latest.error !== undefined ? { error: latest.error } : {}),
    ...(reply ? { placeholderMessageId: reply._id } : {}),
    model: latest.model ?? DEFAULT_AI_MODEL,
    repoId: task.repoId ?? owned.session.repoId,
    taskRun: { mode: latest.mode ?? "implementation" },
  });
  return true;
}
