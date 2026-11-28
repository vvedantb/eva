import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  clearStreamingActivity,
  finalizeCancelledAssistantMessage,
} from "../streaming";
import {
  isUsageLimitError,
  parseUsageLimitResetTime,
} from "../_queues/usageLimitReset";
import {
  assistantReplyContent,
  delayedPublishFailureError,
  orphanPlaceholderMessages,
  resultTargetMessage,
} from "../_sessions/resultTarget";
import { normalizeAIModel } from "../_validators/aiModels";
import { scheduleScopeCheck } from "../_scopeCheck/mutations";
import { recordTurnChange } from "../chatLog";
import { insertTurnFollowUp } from "../_messages/replies";

export type ChatResultParentId = Id<"sessionChats"> | Id<"sessions">;

export type ChatTurnResultOutcome = "publish-failure" | "written" | "no-target";

/**
 * Inserts the standalone publish-failure alert and touches `updatedAt`.
 * Returns true when the caller must stop — do not clear streaming, rewrite
 * the reply, or drain the queue.
 */
export async function recordDelayedPublishFailure(
  ctx: MutationCtx,
  args: {
    parentId: ChatResultParentId;
    result: string | null;
    error: string | null;
    alertTitle: string;
  },
): Promise<boolean> {
  const publishError = delayedPublishFailureError(args.result, args.error);
  if (publishError === undefined) return false;
  await insertTurnFollowUp(ctx, {
    parentId: args.parentId,
    role: "assistant",
    content: args.alertTitle,
    timestamp: Date.now(),
    isSystemAlert: true,
    errorDetail: publishError,
  });
  await ctx.db.patch(args.parentId, { updatedAt: Date.now() });
  return true;
}

/**
 * Keep the last durable streaming snapshot when the supervisor reports a
 * null/empty activity log (a worker can die too hard to serialize steps),
 * then drop the live row so the next turn starts clean.
 */
export async function salvageAndClearStreamingActivity(
  ctx: MutationCtx,
  streamingEntityId: string,
  reportedActivityLog: string | null,
): Promise<string | undefined> {
  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
    .first();
  const activityLog = reportedActivityLog || streaming?.currentActivity;
  await clearStreamingActivity(ctx, streamingEntityId);
  return activityLog || undefined;
}

export type AssistantTurnResultPatch = {
  content: string;
  activityLog?: string;
  pendingQuestion?: string;
  model?: Doc<"messages">["model"];
  isSystemAlert?: boolean;
  errorDetail?: string;
  errorType?: Doc<"messages">["errorType"];
  limitResetAt?: number;
  beforeSha?: string;
  afterSha?: string;
  beforeShas?: Doc<"messages">["beforeShas"];
  afterShas?: Doc<"messages">["afterShas"];
  variations?: Array<{
    label: string;
    route?: string;
    filePath?: string;
  }>;
};

type TurnCheckpointFields = Pick<
  AssistantTurnResultPatch,
  "beforeSha" | "afterSha" | "beforeShas" | "afterShas"
>;

/**
 * Turn checkpoint fields, keeping only complete before/after pairs. A lone
 * `afterSha` would make the turn look like it changed code from nothing.
 */
export function turnCheckpointPatch(
  args: TurnCheckpointFields,
): TurnCheckpointFields {
  return {
    ...(args.beforeSha !== undefined && args.afterSha !== undefined
      ? { beforeSha: args.beforeSha, afterSha: args.afterSha }
      : {}),
    ...(args.beforeShas !== undefined && args.afterShas !== undefined
      ? { beforeShas: args.beforeShas, afterShas: args.afterShas }
      : {}),
  };
}

/**
 * Completion patch for a daemon-driven synthetic (`/loop`) turn. A failed
 * turn drops the open-time model stamp so it never becomes a checkpoint.
 */
export function syntheticTurnCompletionPatch(
  args: {
    success: boolean;
    result: string | null;
    error: string | null;
    activityLog: string | null;
    pendingQuestion?: string;
  } & TurnCheckpointFields,
): AssistantTurnResultPatch & { finishedAt: number } {
  return {
    content: assistantReplyContent({
      success: args.success,
      result: args.result,
      error: args.error,
    }),
    finishedAt: Date.now(),
    ...(args.activityLog ? { activityLog: args.activityLog } : {}),
    ...(args.pendingQuestion ? { pendingQuestion: args.pendingQuestion } : {}),
    ...turnCheckpointPatch(args),
    ...(args.success ? {} : { model: undefined }),
  };
}

/**
 * Writes the turn result onto the targeted assistant bubble and deletes
 * leftover empty placeholders. Returns null when every candidate is
 * disqualified — the caller decides whether that aborts the rest of
 * finalisation (sessions) or still clears the workflow slot (task/project).
 */
export async function writeAssistantTurnResult(
  ctx: MutationCtx,
  parentId: ChatResultParentId,
  fields: AssistantTurnResultPatch,
): Promise<Doc<"messages"> | null> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .take(20);
  const last = resultTargetMessage(recent);
  if (!last) return null;
  await ctx.db.patch(last._id, {
    ...fields,
    finishedAt: Date.now(),
  });
  await scheduleScopeCheck(ctx, {
    _id: last._id,
    beforeSha: fields.beforeSha,
    afterSha: fields.afterSha,
  });
  for (const message of orphanPlaceholderMessages(recent, last)) {
    await ctx.db.delete(message._id);
  }
  return last;
}

/**
 * Shared `saveResult` write path: isolate a delayed publish failure, salvage
 * the stream, write the reply. Entity workflow-slot / queue policy stays
 * with the caller.
 */
export async function applyChatTurnResult(
  ctx: MutationCtx,
  args: {
    parentId: ChatResultParentId;
    streamingEntityId: string;
    success: boolean;
    result: string | null;
    error: string | null;
    activityLog: string | null;
    alertTitle: string;
    pendingQuestion?: string;
    model?: string;
    content?: string;
    extraPatch?: Omit<AssistantTurnResultPatch, "content">;
  },
): Promise<ChatTurnResultOutcome> {
  if (
    await recordDelayedPublishFailure(ctx, {
      parentId: args.parentId,
      result: args.result,
      error: args.error,
      alertTitle: args.alertTitle,
    })
  ) {
    return "publish-failure";
  }

  const activityLog = await salvageAndClearStreamingActivity(
    ctx,
    args.streamingEntityId,
    args.activityLog,
  );

  const patch: AssistantTurnResultPatch = {
    content:
      args.content ??
      assistantReplyContent({
        success: args.success,
        result: args.result,
        error: args.error,
      }),
    ...args.extraPatch,
  };
  const isUsageLimit =
    !args.success && args.error !== null && isUsageLimitError(args.error);
  patch.errorType = isUsageLimit ? "rate_limit" : undefined;
  patch.limitResetAt =
    isUsageLimit && args.error !== null
      ? (parseUsageLimitResetTime(args.error) ?? undefined)
      : undefined;
  if (activityLog) patch.activityLog = activityLog;
  if (args.pendingQuestion) patch.pendingQuestion = args.pendingQuestion;
  if (args.success && args.model !== undefined) {
    patch.model = normalizeAIModel(args.model);
  }

  const last = await writeAssistantTurnResult(ctx, args.parentId, patch);
  if (!last) return "no-target";
  await recordTurnChange(
    ctx,
    String(args.parentId),
    { ...last, content: patch.content },
    patch.beforeSha,
    patch.afterSha,
  );
  return "written";
}

/**
 * Idempotent empty assistant bubble used as the streaming target. Session
 * skips system alerts sitting on top of an already-staged placeholder;
 * task/project chat look at the newest row only.
 */
export async function insertAssistantPlaceholderIfNeeded(
  ctx: MutationCtx,
  args: {
    parentId: ChatResultParentId;
    recentLimit: number;
    skipSystemAlerts: boolean;
  },
): Promise<"existing" | "inserted"> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
    .order("desc")
    .take(args.recentLimit);
  const turnRows = recent.filter(
    (message) => !(message.role === "user" && message.replyTo !== undefined),
  );
  const lastTurnMessage = args.skipSystemAlerts
    ? turnRows.find((message) => message.isSystemAlert !== true)
    : turnRows[0];
  if (
    lastTurnMessage &&
    lastTurnMessage.role === "assistant" &&
    lastTurnMessage.content === "" &&
    lastTurnMessage.finishedAt === undefined &&
    lastTurnMessage.isSyntheticTurn !== true
  ) {
    return "existing";
  }
  await insertTurnFollowUp(ctx, {
    parentId: args.parentId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    activityLog: "",
  });
  await ctx.db.patch(args.parentId, { updatedAt: Date.now() });
  return "inserted";
}

/** Close an unfinished `/loop` continuation bubble when the user hits stop. */
export async function finalizeOpenSyntheticTurnOnCancel(
  ctx: MutationCtx,
  syntheticTurnMessageId: Id<"messages"> | undefined,
  streaming: Doc<"streamingActivity"> | null,
): Promise<void> {
  if (syntheticTurnMessageId === undefined) return;
  const syntheticMessage = await ctx.db.get(syntheticTurnMessageId);
  if (syntheticMessage && syntheticMessage.finishedAt === undefined) {
    await finalizeCancelledAssistantMessage(ctx, syntheticMessage, streaming);
  }
}
