import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { isSessionArchived } from "../_sessions/archive";
import { findOwnedSession } from "../_sessions/owner";
import {
  adoptChatDrafts,
  ensureOwnerChat,
  isTerminalProjectPhase,
  isTerminalTaskStatus,
  ownerBusyReason,
  ownerChatUserIds,
  projectSessionOwner,
  retireOwnedSession,
  taskSessionOwner,
  type OwnerEntity,
} from "../_sessions/ownedSession";
import { moveLegacyTranscriptPage } from "../_sessionChats/helpers";

/**
 * Moves a task's or project's own chat and sandbox onto its owned session
 * (`_sessions/ownedSession.ts`). Run by
 * `dataMigrations:migrateQuickTaskChatsToSessions` (quick tasks, PR 1b) and
 * `dataMigrations:migrateProjectChatsToSessions` (projects and their tasks'
 * chats, PR 2). Per owner:
 *
 *   1. ensure the session and the owner's chat (a quick task's or project's
 *      Main chat, a project task's own chat in the project's session); this
 *      also moves a quick task's or project's sandbox fields onto the session
 *      and clears them on the owner (one owner per sandbox, so the old sweeps
 *      stop acting on it);
 *   2. the chat takes the old chat's sticky model, traits, account, goal,
 *      unread watermark and Claude transcript seed (the owner id), so the
 *      agent resumes the old conversation;
 *   3. read rows are copied, unsent drafts move;
 *   4. the transcript rows (messages, queue, UI panels, HTML renders, env var
 *      requests, feedback, closed turns) move onto the chat in bounded pages;
 *   5. a done / cancelled / deleted quick task's, or a completed / cancelled /
 *      deleted project's, session retires (archive).
 *
 * Idempotent: every step moves rows or copies values that a rerun finds
 * already moved. An owner mid-turn, mid-run, mid-build, mid-interview, with a
 * queued message or with its sandbox starting/stopping is skipped (logged
 * `[ownerChatMigration] skipped`); the `*Left` queries count what is left,
 * and a rerun with `{reset: true}` picks it up.
 */

export type OwnerChatMigrationOutcome =
  | "not_applicable"
  | "skipped_busy"
  | "skipped_sandbox_conflict"
  | "migrated";

function ownerDoc(entity: OwnerEntity): Doc<"agentTasks"> | Doc<"projects"> {
  return entity.kind === "task" ? entity.task : entity.project;
}

/** True when the old chat ever ran a turn, so it has a transcript to resume. */
function ownerChatWasUsed(doc: Doc<"agentTasks"> | Doc<"projects">): boolean {
  return (
    doc.lastChatModel !== undefined ||
    doc.lastTurnFinishedAt !== undefined ||
    doc.chatTurnLifecycleVersion !== undefined
  );
}

/** Step 2: the session chat carries on as the owner's old chat. */
async function adoptOwnerChatSettings(
  ctx: MutationCtx,
  entity: OwnerEntity,
  session: Doc<"sessions">,
  chat: Doc<"sessionChats">,
): Promise<void> {
  const doc = ownerDoc(entity);
  if (!ownerChatWasUsed(doc)) return;
  // Resume the old chat's Claude transcript (`sessionClaudeUuid(ownerId)`).
  // Only while the chat still has its default seed (Main: the session id;
  // another chat: none) and no turn of its own: a chat that already ran on
  // the session keeps its own conversation.
  const chatHasMessages =
    (await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
      .first()) !== null;
  const defaultSeed = chat.isMain ? session._id : undefined;
  const adoptSeed =
    chat.claudePersistenceSeed === defaultSeed && !chatHasMessages;
  await ctx.db.patch(chat._id, {
    ...(adoptSeed ? { claudePersistenceSeed: doc._id } : {}),
    lastModel: doc.lastChatModel ?? chat.lastModel,
    lastReasoningLevel: doc.lastReasoningLevel ?? chat.lastReasoningLevel,
    lastThinkingEnabled: doc.lastThinkingEnabled ?? chat.lastThinkingEnabled,
    lastUse1mContext: doc.lastUse1mContext ?? chat.lastUse1mContext,
    lastFastMode: doc.lastFastMode ?? chat.lastFastMode,
    providerAccountId: chat.providerAccountId ?? doc.providerAccountId,
    lastTurnFinishedAt:
      Math.max(chat.lastTurnFinishedAt ?? 0, doc.lastTurnFinishedAt ?? 0) ||
      undefined,
    goal: chat.goal ?? doc.goal,
  });
}

/**
 * The chat's own read rows, copied from the owner's for the users who can
 * have one we can find by index (`ownerChatUserIds`). The owner's rows stay:
 * cards read unread on the owner id.
 */
async function copyChatReads(
  ctx: MutationCtx,
  entity: OwnerEntity,
  chat: Doc<"sessionChats">,
): Promise<void> {
  const ownerId = ownerDoc(entity)._id;
  const userIds = await ownerChatUserIds(ctx.db, entity);
  await Promise.all(
    userIds.map(async (userId) => {
      const [ownerRead, chatRead] = await Promise.all([
        ctx.db
          .query("chatReads")
          .withIndex("by_user_parent", (q) =>
            q.eq("userId", userId).eq("parentId", ownerId),
          )
          .unique(),
        ctx.db
          .query("chatReads")
          .withIndex("by_user_parent", (q) =>
            q.eq("userId", userId).eq("parentId", chat._id),
          )
          .unique(),
      ]);
      if (!ownerRead || chatRead) return;
      await ctx.db.insert("chatReads", {
        userId,
        parentId: chat._id,
        repoId: chat.repoId,
        lastReadAt: ownerRead.lastReadAt,
      });
    }),
  );
}

/**
 * Steps 1–4 for one owner. `transcript: "inline"` moves the first page now
 * and schedules the rest; `"scheduled"` schedules it all (a project moves
 * its tasks' chats this way, so one mutation stays inside its read budget).
 */
async function moveOwnerChat(
  ctx: MutationCtx,
  entity: OwnerEntity,
  transcript: "inline" | "scheduled",
): Promise<OwnerChatMigrationOutcome> {
  const doc = ownerDoc(entity);
  const busy = await ownerBusyReason(ctx.db, entity);
  if (busy !== null) {
    console.warn(
      `[ownerChatMigration] skipped ${entity.kind}=${doc._id} reason=${busy}`,
    );
    return "skipped_busy";
  }
  // Ensuring the session also hands the owner's sandbox over to it.
  const { session, chat } = await ensureOwnerChat(ctx, entity);
  const left =
    entity.kind === "task"
      ? await ctx.db.get(entity.task._id)
      : await ctx.db.get(entity.project._id);
  // A project task never had a sandbox of its own: no conflict to check.
  const ownsSandbox =
    entity.kind === "project" || entity.task.projectId === undefined;
  if (
    ownsSandbox &&
    left?.sandboxId !== undefined &&
    left.sandboxId !== session.sandboxId
  ) {
    console.warn(
      `[ownerChatMigration] skipped ${entity.kind}=${doc._id} reason=sandbox conflict owner=${left.sandboxId} session=${session.sandboxId}`,
    );
    return "skipped_sandbox_conflict";
  }
  await adoptOwnerChatSettings(ctx, entity, session, chat);
  await copyChatReads(ctx, entity, chat);
  await adoptChatDrafts(ctx, entity, chat);
  const done =
    transcript === "inline" &&
    (await moveLegacyTranscriptPage(ctx, doc._id, chat._id));
  if (!done) {
    await ctx.scheduler.runAfter(
      0,
      internal._sessionChats.mutations.moveLegacyTranscript,
      { from: doc._id, chatId: chat._id },
    );
  }
  return "migrated";
}

/** Archives a retired owner's session (step 5), once. */
async function retireIfDone(
  ctx: MutationCtx,
  entity: OwnerEntity,
): Promise<void> {
  const owner =
    entity.kind === "task"
      ? taskSessionOwner(entity.task._id)
      : projectSessionOwner(entity.project._id);
  const retired =
    entity.kind === "task"
      ? isTerminalTaskStatus(entity.task.status) ||
        entity.task.deletedAt !== undefined
      : isTerminalProjectPhase(entity.project.phase) ||
        entity.project.deletedAt !== undefined;
  if (!retired) return;
  const session = await findOwnedSession(ctx.db, owner);
  if (session && !isSessionArchived(session)) {
    await retireOwnedSession(ctx, owner);
  }
}

/** One quick task's move (PR 1b); see the module comment. */
export async function migrateQuickTaskToSession(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<OwnerChatMigrationOutcome> {
  if (task.projectId !== undefined || task.repoId === undefined) {
    return "not_applicable";
  }
  const entity: OwnerEntity = { kind: "task", task };
  const outcome = await moveOwnerChat(ctx, entity, "inline");
  if (outcome === "migrated") await retireIfDone(ctx, entity);
  return outcome;
}

/** Whether a project task's old chat has anything to move. */
async function projectTaskChatHasHistory(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  if (ownerChatWasUsed(task)) return true;
  const message = await db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", task._id))
    .first();
  return message !== null;
}

/**
 * One project's move (PR 2): the project's chat and sandbox onto its
 * session's Main chat, then each of its tasks' old chats onto that task's
 * own chat in the project's session (a project task has no sandbox of its
 * own: task-row sandbox fields on it are ignored). A busy task is skipped on
 * its own; the project still counts as migrated, and a rerun picks the
 * task up.
 */
export async function migrateProjectToSession(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<OwnerChatMigrationOutcome> {
  const entity: OwnerEntity = { kind: "project", project };
  const outcome = await moveOwnerChat(ctx, entity, "inline");
  if (outcome !== "migrated") return outcome;
  const tasks = await ctx.db
    .query("agentTasks")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .collect();
  for (const task of tasks) {
    if (!(await projectTaskChatHasHistory(ctx.db, task))) continue;
    await moveOwnerChat(ctx, { kind: "task", task }, "scheduled");
  }
  await retireIfDone(ctx, entity);
  return outcome;
}

const leftValidator = v.object({
  left: v.number(),
  busy: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

/**
 * What the quick-task migration has left, one page of standalone tasks at a
 * time: tasks still holding a task sandbox or task-parented messages. Loop
 * `cursor` until `isDone`; 0 everywhere means the move is complete.
 *
 * `npx convex run migrations:quickTaskChatsLeft '{}'`
 */
export const quickTaskChatsLeft = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: leftValidator,
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
      if ((await ownerBusyReason(ctx.db, { kind: "task", task })) !== null) {
        busy += 1;
      }
    }
    return {
      left,
      busy,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * What the project migration has left, one page of projects at a time: a
 * project still holding its own sandbox or project-parented messages, or
 * with a task whose old chat still holds messages. Loop `cursor` until
 * `isDone`; 0 everywhere means the move is complete.
 *
 * `npx convex run migrations:projectChatsLeft '{}'`
 */
export const projectChatsLeft = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: leftValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("projects")
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });
    let left = 0;
    let busy = 0;
    for (const project of page.page) {
      const [projectMessage, tasks] = await Promise.all([
        ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", project._id))
          .first(),
        ctx.db
          .query("agentTasks")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect(),
      ]);
      const taskMessages = await Promise.all(
        tasks.map((task) =>
          ctx.db
            .query("messages")
            .withIndex("by_parent", (q) => q.eq("parentId", task._id))
            .first(),
        ),
      );
      if (
        project.sandboxId === undefined &&
        projectMessage === null &&
        taskMessages.every((message) => message === null)
      ) {
        continue;
      }
      left += 1;
      if ((await ownerBusyReason(ctx.db, { kind: "project", project })) !== null) {
        busy += 1;
      }
    }
    return {
      left,
      busy,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
