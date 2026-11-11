import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { isTaskRunning } from "../_agentTasks/runState";
import {
  hasOpenChatTurn,
  isLegacyChatExecuting,
} from "../_chat/turnProjection";
import { isSessionArchived } from "../_sessions/archive";
import {
  ensureOwnedSession,
  isTerminalTaskStatus,
  retireOwnedSession,
} from "../_sessions/ownedSession";
import { moveLegacyTranscriptPage } from "../_sessionChats/helpers";

/**
 * Moves a quick task (no `projectId`) from its own chat and sandbox onto its
 * owned session (`_sessions/ownedSession.ts`), run by
 * `dataMigrations:migrateQuickTaskChatsToSessions`:
 *
 *   1. ensure the task's session and Main chat;
 *   2. Main chat takes the task chat's sticky model, traits, unread
 *      watermark and Claude transcript seed (the task id), so the agent
 *      resumes the old conversation;
 *   3. the task's sandbox fields move onto the session and are cleared on
 *      the task (one owner per sandbox, so task sweeps stop acting on it);
 *   4. the transcript rows move onto the Main chat in bounded pages;
 *   5. a done / cancelled / deleted task retires its session (archive).
 *
 * Idempotent: every step moves rows or copies values that a rerun finds
 * already moved. A task mid-turn, mid-run, with a queued message or with its
 * sandbox starting/stopping is skipped (logged with `[quickTaskMigration]
 * skipped`); `quickTaskChatsLeft` counts what is left, and a rerun with
 * `{reset: true}` picks it up.
 */

export type QuickTaskMigrationOutcome =
  | "not_quick_task"
  | "skipped_busy"
  | "skipped_sandbox_conflict"
  | "migrated";

/** Why a quick task cannot move now, or null when it can. */
async function busyReason(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<string | null> {
  if (isTaskRunning(task)) return "run in flight";
  if (
    task.pendingTurn !== undefined ||
    task.syntheticTurnMessageId !== undefined ||
    isLegacyChatExecuting(task) ||
    (await hasOpenChatTurn(db, task._id))
  ) {
    return "chat turn open";
  }
  if (
    task.reviewTaskSandboxStatus === "starting" ||
    task.reviewTaskSandboxStatus === "stopping"
  ) {
    return `sandbox ${task.reviewTaskSandboxStatus}`;
  }
  const queued = await db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", task._id))
    .first();
  if (queued) return "queued message";
  return null;
}

/** True when the task chat ever ran a turn, so it has a transcript to resume. */
function taskChatWasUsed(task: Doc<"agentTasks">): boolean {
  return (
    task.lastChatModel !== undefined ||
    task.lastTurnFinishedAt !== undefined ||
    task.chatTurnLifecycleVersion !== undefined
  );
}

/** Step 2: the Main chat carries on as the task chat. */
async function adoptTaskChatSettings(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  session: Doc<"sessions">,
  mainChat: Doc<"sessionChats">,
): Promise<void> {
  if (!taskChatWasUsed(task)) return;
  // Resume the task chat's Claude transcript (`sessionClaudeUuid(taskId)`).
  // Only while the chat still has its default seed and no turn of its own:
  // a chat that already ran on the session keeps its own conversation.
  const chatHasMessages =
    (await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", mainChat._id))
      .first()) !== null;
  const adoptSeed =
    mainChat.claudePersistenceSeed === session._id && !chatHasMessages;
  await ctx.db.patch(mainChat._id, {
    ...(adoptSeed ? { claudePersistenceSeed: task._id } : {}),
    lastModel: task.lastChatModel ?? mainChat.lastModel,
    lastReasoningLevel: task.lastReasoningLevel ?? mainChat.lastReasoningLevel,
    lastThinkingEnabled:
      task.lastThinkingEnabled ?? mainChat.lastThinkingEnabled,
    lastUse1mContext: task.lastUse1mContext ?? mainChat.lastUse1mContext,
    lastFastMode: task.lastFastMode ?? mainChat.lastFastMode,
    providerAccountId: mainChat.providerAccountId ?? task.providerAccountId,
    lastTurnFinishedAt: Math.max(
      mainChat.lastTurnFinishedAt ?? 0,
      task.lastTurnFinishedAt ?? 0,
    ) || undefined,
    goal: mainChat.goal ?? task.goal,
  });
}

/**
 * Step 3: the sandbox moves to the session. Returns false when the session
 * already holds a different sandbox (a run after deploy created one): the
 * task's VM is left alone for a person to look at.
 */
async function moveTaskSandbox(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  session: Doc<"sessions">,
): Promise<boolean> {
  if (task.sandboxId === undefined) return true;
  if (session.sandboxId !== undefined && session.sandboxId !== task.sandboxId) {
    return false;
  }
  await ctx.db.patch(session._id, {
    sandboxId: task.sandboxId,
    status: task.reviewTaskSandboxStatus === "active" ? "active" : "closed",
    sandboxStartAttempt: task.sandboxStartAttempt ?? session.sandboxStartAttempt,
    devPort: task.devPort ?? session.devPort,
    devCommand: task.devCommand ?? session.devCommand,
    previewPath: task.previewPath ?? session.previewPath,
    previewPanePaths: task.previewPanePaths ?? session.previewPanePaths,
    terminalHistoryTail: task.terminalHistoryTail ?? session.terminalHistoryTail,
    terminalPanes: task.terminalPanes ?? session.terminalPanes,
    sandboxBranch: task.sandboxBranch ?? session.sandboxBranch,
    sandboxGitSync: task.sandboxGitSync ?? session.sandboxGitSync,
  });
  await ctx.db.patch(task._id, {
    sandboxId: undefined,
    reviewTaskSandboxStatus: undefined,
    sandboxStartAttempt: undefined,
    sandboxDeleteAfter: undefined,
    devPort: undefined,
    devCommand: undefined,
    previewPath: undefined,
    previewPanePaths: undefined,
    terminalHistoryTail: undefined,
    terminalPanes: undefined,
    sandboxBranch: undefined,
    sandboxGitSync: undefined,
  });
  return true;
}

/**
 * The chat's own read rows, copied from the task's for the users who can
 * have one we can find by index (owner, assignee, subscribers). The task's
 * rows stay: task cards read unread on the task id.
 */
async function copyChatReads(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  mainChat: Doc<"sessionChats">,
): Promise<void> {
  const subscribers = await ctx.db
    .query("taskSubscribers")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  const userIds = new Set<Id<"users">>([
    task.createdBy,
    ...(task.assignedTo ? [task.assignedTo] : []),
    ...subscribers.map((row) => row.userId),
  ]);
  await Promise.all(
    [...userIds].map(async (userId) => {
      const [taskRead, chatRead] = await Promise.all([
        ctx.db
          .query("chatReads")
          .withIndex("by_user_parent", (q) =>
            q.eq("userId", userId).eq("parentId", task._id),
          )
          .unique(),
        ctx.db
          .query("chatReads")
          .withIndex("by_user_parent", (q) =>
            q.eq("userId", userId).eq("parentId", mainChat._id),
          )
          .unique(),
      ]);
      if (!taskRead || chatRead) return;
      await ctx.db.insert("chatReads", {
        userId,
        parentId: mainChat._id,
        repoId: mainChat.repoId,
        lastReadAt: taskRead.lastReadAt,
      });
    }),
  );
}

/** One task's move; see the module comment. */
export async function migrateQuickTaskToSession(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<QuickTaskMigrationOutcome> {
  if (task.projectId !== undefined || task.repoId === undefined) {
    return "not_quick_task";
  }
  const busy = await busyReason(ctx.db, task);
  if (busy !== null) {
    console.warn(
      `[quickTaskMigration] skipped task=${task._id} reason=${busy}`,
    );
    return "skipped_busy";
  }
  const { session, mainChat } = await ensureOwnedSession(ctx, task);
  if (!(await moveTaskSandbox(ctx, task, session))) {
    console.warn(
      `[quickTaskMigration] skipped task=${task._id} reason=sandbox conflict task=${task.sandboxId} session=${session.sandboxId}`,
    );
    return "skipped_sandbox_conflict";
  }
  await adoptTaskChatSettings(ctx, task, session, mainChat);
  await copyChatReads(ctx, task, mainChat);
  if (!(await moveLegacyTranscriptPage(ctx, task._id, mainChat._id))) {
    await ctx.scheduler.runAfter(
      0,
      internal._sessionChats.mutations.moveLegacyTranscript,
      { from: task._id, chatId: mainChat._id },
    );
  }
  const retired = isTerminalTaskStatus(task.status) || task.deletedAt !== undefined;
  const current = await ctx.db.get(session._id);
  if (retired && current && !isSessionArchived(current)) {
    await retireOwnedSession(ctx, task._id);
  }
  return "migrated";
}

/**
 * What the migration has left, one page of standalone tasks at a time:
 * tasks still holding a task sandbox, task-parented messages or no session.
 * Loop `cursor` until `isDone`; 0 everywhere means the move is complete.
 *
 * `npx convex run migrations:quickTaskChatsLeft '{}'`
 */
export const quickTaskChatsLeft = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({
    left: v.number(),
    busy: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", undefined))
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    let left = 0;
    let busy = 0;
    for (const task of page.page) {
      if (task.repoId === undefined) continue;
      const legacyMessage = await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", task._id))
        .first();
      if (task.sandboxId === undefined && legacyMessage === null) continue;
      left += 1;
      if ((await busyReason(ctx.db, task)) !== null) busy += 1;
    }
    return {
      left,
      busy,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
