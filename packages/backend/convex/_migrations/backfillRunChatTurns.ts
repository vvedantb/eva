import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { findWorkChat } from "../_sessions/ownerState";
import { runChatPrompt, runReplyContent } from "../_taskWorkflow/runChatTurn";

const PAGE_SIZE = 50;

/**
 * Gives old quick tasks the chat turn their first run used to show as a
 * client-built turn, now that runs write real rows (`runChatTurn.ts`).
 *
 * Rows sort by insert time, which cannot be backdated, so a task is skipped
 * when its chat already holds a row after the run (other than a system
 * alert): the run would show below it. Safe to re-run: a task whose runs
 * already have a chat turn is skipped. Pages through every task, scheduling
 * itself. Delete this file once it has run in dev and prod.
 */
export const backfillRunChatTurns = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    written: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("agentTasks")
      .paginate({ cursor: args.cursor ?? null, numItems: PAGE_SIZE });
    let written = args.written ?? 0;
    for (const task of page.page) {
      if (await backfillTask(ctx, task)) written += 1;
    }
    if (page.isDone) {
      console.log(`[backfillRunChatTurns] done, wrote ${written} turns`);
      return null;
    }
    await ctx.scheduler.runAfter(
      0,
      internal._migrations.backfillRunChatTurns.backfillRunChatTurns,
      { cursor: page.continueCursor, written },
    );
    return null;
  },
});

async function backfillTask(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  // Only quick tasks showed a first-run turn.
  if (task.projectId !== undefined) return false;
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  if (runs.some((run) => run.replyMessageId !== undefined)) return false;
  const run = shownFirstRun(runs);
  if (!run) return false;
  const owned = await findWorkChat(ctx.db, { kind: "task", task });
  if (!owned) return false;
  const startedAt = run.startedAt ?? run._creationTime;
  const later = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) =>
      q.eq("parentId", owned.chat._id).gt("_creationTime", startedAt),
    )
    .filter((q) => q.neq(q.field("isSystemAlert"), true))
    .first();
  if (later) return false;

  const activityLog = await runActivityLog(ctx, run);
  await ctx.db.insert("messages", {
    parentId: owned.chat._id,
    role: "user",
    content: runChatPrompt({
      task,
      mode: run.mode,
      isFirstRun: true,
      comment: undefined,
      note: run.note,
    }),
    timestamp: task.createdAt,
    runId: run._id,
    userId: run.triggeredBy ?? task.createdBy,
    ...(run.model !== undefined ? { model: run.model } : {}),
    ...(run.credentialSourceLabel !== undefined
      ? { credentialSourceLabel: run.credentialSourceLabel }
      : {}),
    ...((task.attachmentStorageIds?.length ?? 0) > 0
      ? { attachmentStorageIds: task.attachmentStorageIds }
      : {}),
  });
  const replyMessageId = await ctx.db.insert("messages", {
    parentId: owned.chat._id,
    role: "assistant",
    content: runReplyContent(run),
    timestamp: startedAt,
    runId: run._id,
    ...(activityLog !== undefined ? { activityLog } : {}),
    ...(run.mediaStorageIds !== undefined && run.mediaStorageIds.length > 0
      ? { mediaStorageIds: run.mediaStorageIds }
      : {}),
    ...(run.status === "success" && run.model !== undefined
      ? { model: run.model }
      : {}),
    ...(run.status === "cancelled" ? { stopped: true as const } : {}),
    finishedAt: run.finishedAt ?? startedAt,
  });
  await ctx.db.patch(run._id, { replyMessageId });
  return true;
}

/**
 * The run the web used to show as the opening turn: the earliest settled
 * success with a reply, else the latest failed or cancelled run. "Make
 * changes" and Resolve Conflicts runs never showed. Runs still in flight are
 * skipped: they started before runs wrote chat rows.
 */
function shownFirstRun(
  runs: readonly Doc<"agentRuns">[],
): Doc<"agentRuns"> | undefined {
  const start = (run: Doc<"agentRuns">) => run.startedAt ?? run._creationTime;
  const eligible = runs.filter(
    (run) =>
      run.triggeringCommentId === undefined && run.mode !== "resolve_conflicts",
  );
  const successes = eligible
    .filter((run) => run.status === "success" && run.resultSummary)
    .sort((a, b) => start(a) - start(b));
  if (successes[0]) return successes[0];
  return eligible
    .filter((run) => run.status === "error" || run.status === "cancelled")
    .sort((a, b) => start(b) - start(a))[0];
}

async function runActivityLog(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
): Promise<string | undefined> {
  const row =
    (await ctx.db
      .query("agentRunActivityLogs")
      .withIndex("by_run_and_type", (q) =>
        q.eq("runId", run._id).eq("type", "run"),
      )
      .first()) ??
    (await ctx.db
      .query("agentRunActivityLogs")
      .withIndex("by_run_and_type", (q) =>
        q.eq("runId", run._id).eq("type", undefined),
      )
      .first());
  return row?.activityLog;
}
