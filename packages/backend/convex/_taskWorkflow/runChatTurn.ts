import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { salvageAndClearStreamingActivity } from "../_chat/chatResult";
import { sessionChatStreamingEntityId } from "../_sessionChats/helpers";
import { clearStreamingActivity, upsertActivityLog } from "./helpers";

/**
 * A task run is a turn in its task's Main chat: the run writes a user row
 * (what started it) and an assistant row it streams into, both tagged with
 * `runId`. The run's durable turn stays keyed on the run; only its stream
 * and its rows live in the chat. While a run is open no chat turn may start
 * (`sessionChatHasFreeSlot`), so the two never share the chat's stream row.
 */

/** What started a run, as the chat's user row says it. */
function runChatPrompt(p: {
  task: Pick<Doc<"agentTasks">, "title" | "description">;
  mode: Doc<"agentRuns">["mode"];
  isFirstRun: boolean;
  comment: string | undefined;
  note: string | undefined;
}): string {
  if (p.mode === "resolve_conflicts") return "Resolve merge conflicts";
  if (p.comment !== undefined) return p.comment;
  if (p.note !== undefined) return p.note;
  if (p.isFirstRun) {
    return p.task.description
      ? `${p.task.title}\n\n${p.task.description}`
      : p.task.title;
  }
  return "Run again";
}

/**
 * Writes a new run's two chat rows and links its reply row to the run.
 * Returns the stream id the run's turn and runner must use.
 */
export async function openRunChatTurn(
  ctx: MutationCtx,
  p: {
    run: Doc<"agentRuns">;
    task: Doc<"agentTasks">;
    chat: Doc<"sessionChats">;
    userId: Id<"users"> | undefined;
    isFirstRun: boolean;
  },
): Promise<string> {
  const { run, task, chat } = p;
  const comment = run.triggeringCommentId
    ? (await ctx.db.get(run.triggeringCommentId))?.content
    : undefined;
  const streamingEntityId = sessionChatStreamingEntityId(chat._id);
  // A stale row from an earlier turn would show as this run's first steps.
  await clearStreamingActivity(ctx, streamingEntityId);
  const now = Date.now();
  await ctx.db.insert("messages", {
    parentId: chat._id,
    role: "user",
    content: runChatPrompt({
      task,
      mode: run.mode,
      isFirstRun: p.isFirstRun,
      comment,
      note: run.note,
    }),
    timestamp: now,
    runId: run._id,
    ...(p.userId !== undefined ? { userId: p.userId } : {}),
    ...(run.model !== undefined ? { model: run.model } : {}),
    ...(run.credentialSourceLabel !== undefined
      ? { credentialSourceLabel: run.credentialSourceLabel }
      : {}),
    ...(p.isFirstRun && (task.attachmentStorageIds?.length ?? 0) > 0
      ? { attachmentStorageIds: task.attachmentStorageIds }
      : {}),
  });
  const replyMessageId = await ctx.db.insert("messages", {
    parentId: chat._id,
    role: "assistant",
    content: "",
    timestamp: now,
    activityLog: "",
    runId: run._id,
  });
  await ctx.db.patch(run._id, { replyMessageId });
  await ctx.db.patch(chat._id, { updatedAt: now });
  await ctx.db.patch(chat.sessionId, { updatedAt: now });
  return streamingEntityId;
}

/** The stream a run writes to: its chat's. Null for a run with no chat turn. */
export async function runStreamingEntityId(
  db: DatabaseReader,
  run: Pick<Doc<"agentRuns">, "replyMessageId">,
): Promise<string | null> {
  const reply = run.replyMessageId ? await db.get(run.replyMessageId) : null;
  return reply ? String(reply.parentId) : null;
}

/** A settled run's reply: the agent's last text, then the error if it failed. */
function runReplyContent(run: Doc<"agentRuns">): string {
  const error =
    run.status === "error"
      ? `Error: ${run.error || "Unknown error during execution."}`
      : undefined;
  return [run.resultSummary, error].filter(Boolean).join("\n\n");
}

/**
 * The one end of a run's chat turn, called on every terminal path after the
 * run's status is written (completion, cancel, stale cleanup, watchdog,
 * failed start). Fills the reply row from the run, keeps the activity log
 * (the reported one, else the last streamed steps), and clears the stream.
 * Idempotent: a reply already settled is left alone, and so is the chat's
 * stream, which by then may belong to the next chat turn.
 */
export async function settleRunChatTurn(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  runId: Id<"agentRuns">,
  opts: { activityLog?: string | null } = {},
): Promise<void> {
  await clearStreamingActivity(ctx, String(taskId));
  const run = await ctx.db.get(runId);
  if (!run) return;
  const reply = run.replyMessageId ? await ctx.db.get(run.replyMessageId) : null;
  if (!reply) {
    if (opts.activityLog) await upsertActivityLog(ctx, runId, opts.activityLog);
    return;
  }
  if (reply.finishedAt !== undefined) return;
  const activityLog = await salvageAndClearStreamingActivity(
    ctx,
    String(reply.parentId),
    opts.activityLog ?? null,
  );
  if (activityLog) await upsertActivityLog(ctx, runId, activityLog);
  await ctx.db.patch(reply._id, {
    content: runReplyContent(run),
    ...(activityLog ? { activityLog } : {}),
    ...(run.mediaStorageIds !== undefined && run.mediaStorageIds.length > 0
      ? { mediaStorageIds: run.mediaStorageIds }
      : {}),
    ...(run.status === "success" && run.model !== undefined
      ? { model: run.model }
      : {}),
    ...(run.status === "cancelled" ? { stopped: true as const } : {}),
    finishedAt: run.finishedAt ?? Date.now(),
  });
  const chatId = ctx.db.normalizeId("sessionChats", reply.parentId);
  if (chatId) await ctx.db.patch(chatId, { updatedAt: Date.now() });
}
