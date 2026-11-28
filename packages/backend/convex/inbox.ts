import { v } from "convex/values";
import { entityHref } from "@eva/shared";
import {
  INBOX_NEW_COUNT_CAP,
  inboxActionForNeedsYou,
  inboxChatRefFromHref,
  inboxContextLabel,
  inboxHistoryRow,
  inboxGroupForNeedsYou,
  inboxPreview,
  joinInboxLine,
  mergeInboxRows,
} from "@eva/shared/inbox";
import { isNeedsYouNotification } from "@eva/shared/notificationRouting";
import { splitNotificationTitle } from "@eva/shared/notificationTitle";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { notificationTypeValidator } from "./_validators/enums";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { collectNeedsYou, inboxRepos, type NeedsYouRow } from "./needsYou";
import { getReadRow, lastChatActivityAt } from "./chatReads";
import { findMainChat } from "./_sessionChats/helpers";
import { findWorkChat } from "./_sessions/ownerState";
import { isSessionArchived } from "./_sessions/archive";
import { sessionOwnerEntityId } from "./_sessions/owner";

const inboxChatIdValidator = v.union(
  v.id("agentTasks"),
  v.id("projects"),
  v.id("sessions"),
);

const inboxRowValidator = v.object({
  key: v.string(),
  group: v.union(v.literal("holding"), v.literal("waiting"), v.literal("new")),
  kind: v.union(v.literal("chat"), v.literal("alert")),
  contextLabel: v.string(),
  title: v.string(),
  preview: v.optional(v.string()),
  at: v.number(),
  newCount: v.optional(v.number()),
  unread: v.boolean(),
  action: v.optional(
    v.union(v.literal("answer"), v.literal("review"), v.literal("retry")),
  ),
  doneChatId: v.optional(inboxChatIdValidator),
  notificationId: v.optional(v.id("notifications")),
  taskId: v.optional(v.id("agentTasks")),
  prUrl: v.optional(v.string()),
  href: v.optional(v.string()),
  chatTarget: v.optional(v.string()),
  threadRootId: v.optional(v.id("messages")),
  repoId: v.optional(v.id("githubRepos")),
  notice: v.optional(
    v.object({
      type: notificationTypeValidator,
      title: v.string(),
      message: v.optional(v.string()),
    }),
  ),
});

type InboxRow = typeof inboxRowValidator.type;

const READ_ROW_SCAN_LIMIT = 300;
const NEW_ROW_LIMIT = 50;
const ALERT_SCAN_LIMIT = 100;

export const list = authQuery({
  args: { repoId: v.optional(v.id("githubRepos")) },
  returns: v.array(inboxRowValidator),
  handler: async (ctx, args) => {
    const repos = await inboxRepos(ctx.db, ctx.userId, args.repoId);
    const [needs, chats, alerts] = await Promise.all([
      collectNeedsYou(ctx.db, ctx.userId, repos),
      newChatRows(ctx.db, ctx.userId, repos),
      alertRows(ctx.db, ctx.userId, repos, args.repoId === undefined),
    ]);
    return mergeInboxRows([
      ...needs.live.map((row) => needsYouInboxRow(row, false)),
      ...needs.asks.map((row) => needsYouInboxRow(row, true)),
      ...chats,
      ...alerts,
    ]);
  },
});

function needsYouInboxRow(row: NeedsYouRow, fromNotification: boolean): InboxRow {
  return {
    key: row.chatKey,
    group: inboxGroupForNeedsYou(row.group, fromNotification),
    kind: "chat",
    contextLabel: inboxContextLabel(row),
    title: row.title,
    preview: row.detail ? inboxPreview(row.detail) : undefined,
    at: row.at,
    unread: fromNotification,
    action: inboxActionForNeedsYou(row),
    notificationId: row.notificationId,
    taskId: row.taskId,
    prUrl: row.prUrl,
    href: row.href,
    chatTarget: row.chatTarget,
    threadRootId: row.threadRootId,
    repoId: row.repoId,
  };
}

type InboxChat =
  | { kind: "task"; doc: Doc<"agentTasks"> }
  | { kind: "project"; doc: Doc<"projects"> }
  | { kind: "session"; doc: Doc<"sessions"> };

async function loadInboxChat(
  db: DatabaseReader,
  parentId: Doc<"chatReads">["parentId"],
): Promise<InboxChat | null> {
  const taskId = db.normalizeId("agentTasks", parentId);
  if (taskId) {
    const doc = await db.get(taskId);
    return doc && doc.archivedAt === undefined ? { kind: "task", doc } : null;
  }
  const projectId = db.normalizeId("projects", parentId);
  if (projectId) {
    const doc = await db.get(projectId);
    return doc && doc.archivedAt === undefined ? { kind: "project", doc } : null;
  }
  const sessionId = db.normalizeId("sessions", parentId);
  if (sessionId) {
    const doc = await db.get(sessionId);
    if (!doc) return null;
    const ownerId = sessionOwnerEntityId(doc);
    if (ownerId !== undefined) return await loadInboxChat(db, ownerId);
    return doc.deletedAt === undefined && !isSessionArchived(doc)
      ? { kind: "session", doc }
      : null;
  }
  return null;
}

function tookPart(
  userId: Id<"users">,
  chat: InboxChat,
  row: Doc<"chatReads">,
): boolean {
  if (row.joinedAt !== undefined) return true;
  if (chat.kind === "task") return chat.doc.createdBy === userId;
  return chat.doc.userId === userId;
}

function isNewSinceLooked(
  row: Doc<"chatReads">,
  activityAt: number | undefined,
): boolean {
  const doneAt = row.doneAt ?? 0;
  if (activityAt === undefined || activityAt <= doneAt) return false;
  return activityAt > row.lastReadAt || (row.seenNewAt ?? 0) > doneAt;
}

async function newChatRows(
  db: DatabaseReader,
  userId: Id<"users">,
  repos: readonly Doc<"githubRepos">[],
): Promise<InboxRow[]> {
  const perRepo = await Promise.all(
    repos.map(async (repo) => {
      const reads = await db
        .query("chatReads")
        .withIndex("by_user_repo", (q) =>
          q.eq("userId", userId).eq("repoId", repo._id),
        )
        .order("desc")
        .take(READ_ROW_SCAN_LIMIT);
      const owned = reads.filter(
        (row) => db.normalizeId("sessionChats", row.parentId) === null,
      );
      const chats = await Promise.all(
        owned.map((row) => loadInboxChat(db, row.parentId)),
      );
      return owned.flatMap((row, index) => {
        const chat = chats[index];
        if (!chat || chat.doc._id !== row.parentId) return [];
        if (!tookPart(userId, chat, row)) return [];
        const activityAt = lastChatActivityAt(chat.doc);
        if (!isNewSinceLooked(row, activityAt)) return [];
        return [{ repo, chat, row, activityAt: activityAt ?? 0 }];
      });
    }),
  );
  const waiting = perRepo
    .flat()
    .sort((a, b) => b.activityAt - a.activityAt)
    .slice(0, NEW_ROW_LIMIT);
  return await Promise.all(
    waiting.map(async ({ repo, chat, row, activityAt }): Promise<InboxRow> => {
      const [latest, projectTitle] = await Promise.all([
        latestMessages(db, chat),
        chatProjectTitle(db, chat),
      ]);
      const newCount = latest.filter((m) => m.timestamp > row.lastReadAt).length;
      return {
        key: String(chat.doc._id),
        group: "new",
        kind: "chat",
        ...chatIdentity(repo, chat, projectTitle),
        preview: latest[0] ? inboxPreview(latest[0].content) : undefined,
        at: activityAt,
        newCount: newCount > 0 ? newCount : undefined,
        unread: activityAt > row.lastReadAt,
        doneChatId: chat.doc._id,
        repoId: repo._id,
      };
    }),
  );
}

function chatIdentity(
  repo: Doc<"githubRepos">,
  chat: InboxChat,
  projectTitle: string | undefined,
): Pick<InboxRow, "contextLabel" | "title" | "href" | "chatTarget" | "taskId"> {
  if (chat.kind === "session") {
    return {
      contextLabel: inboxContextLabel({ source: "session", numId: chat.doc.numId }),
      title: chat.doc.title,
      href: entityHref("session", repo, chat.doc.numId),
      chatTarget: String(chat.doc._id),
    };
  }
  if (chat.kind === "project") {
    return {
      contextLabel: inboxContextLabel({ source: "project", projectTitle: chat.doc.title }),
      title: chat.doc.title,
      href: entityHref("project", repo, chat.doc.numId),
      chatTarget: String(chat.doc._id),
    };
  }
  const task = chat.doc;
  return {
    contextLabel: inboxContextLabel({
      source: task.projectId === undefined ? "quick_task" : "project",
      projectTitle,
      numId: task.numId,
    }),
    title: task.title,
    href: entityHref("task", repo, task.numId),
    chatTarget: String(task._id),
    taskId: task._id,
  };
}

async function latestMessages(
  db: DatabaseReader,
  chat: InboxChat,
): Promise<Doc<"messages">[]> {
  const mainChat =
    chat.kind === "session"
      ? await findMainChat(db, chat.doc._id)
      : (
          await findWorkChat(
            db,
            chat.kind === "task"
              ? { kind: "task", task: chat.doc }
              : { kind: "project", project: chat.doc },
          )
        )?.chat;
  if (!mainChat) return [];
  return await db
    .query("messages")
    .withIndex("by_parent_and_reply_to", (q) =>
      q.eq("parentId", mainChat._id).eq("replyTo", undefined),
    )
    .order("desc")
    .take(INBOX_NEW_COUNT_CAP + 1);
}

async function alertRows(
  db: DatabaseReader,
  userId: Id<"users">,
  repos: readonly Doc<"githubRepos">[],
  includeRepoless: boolean,
): Promise<InboxRow[]> {
  const repoById = new Map(repos.map((repo) => [String(repo._id), repo]));
  const unread = (
    await db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .order("desc")
      .take(ALERT_SCAN_LIMIT)
  ).filter(
    (n) =>
      n.archivedAt === undefined &&
      !isNeedsYouNotification(n) &&
      (n.repoId === undefined ? includeRepoless : repoById.has(String(n.repoId))),
  );
  const rows = await Promise.all(
    unread.map(async (n): Promise<InboxRow | null> => {
      const repo = n.repoId === undefined ? undefined : repoById.get(String(n.repoId));
      const chat = repo ? await notificationChat(db, repo, n) : null;
      if (!repo || !chat) return inboxHistoryRow(n);
      const { event } = splitNotificationTitle(n);
      const [read, projectTitle] = await Promise.all([
        getReadRow(db, userId, chat.doc._id),
        chatProjectTitle(db, chat),
      ]);
      if ((read?.doneAt ?? 0) >= n.createdAt) return null;
      const identity = chatIdentity(repo, chat, projectTitle);
      return {
        key: String(chat.doc._id),
        group: "new",
        kind: "chat",
        ...identity,
        preview: alertLine(event, n.message),
        at: n.createdAt,
        unread: true,
        doneChatId: chat.doc._id,
        notificationId: n._id,
        href: n.threadRootId !== undefined && n.href ? n.href : identity.href,
        threadRootId: n.threadRootId,
        repoId: repo._id,
        notice: noticeOf(n),
      };
    }),
  );
  return rows.filter((row) => row !== null);
}

function noticeOf(n: Doc<"notifications">): InboxRow["notice"] {
  return { type: n.type, title: n.title, message: n.message };
}

function alertLine(event: string | undefined, message: string | undefined): string | undefined {
  const text = message ? inboxPreview(message) : undefined;
  return joinInboxLine(event, text, ": ");
}

async function chatProjectTitle(
  db: DatabaseReader,
  chat: InboxChat,
): Promise<string | undefined> {
  if (chat.kind !== "task" || chat.doc.projectId === undefined) return undefined;
  return (await db.get(chat.doc.projectId))?.title;
}

async function notificationChat(
  db: DatabaseReader,
  repo: Doc<"githubRepos">,
  n: Doc<"notifications">,
): Promise<InboxChat | null> {
  if (n.chatTarget !== undefined) return await chatOfTarget(db, n.chatTarget);
  const ref = n.href ? inboxChatRefFromHref(n.href) : undefined;
  if (!ref) return null;
  const doc =
    ref.kind === "task"
      ? await db
          .query("agentTasks")
          .withIndex("by_repo_and_numId", (q) => q.eq("repoId", repo._id).eq("numId", ref.numId))
          .first()
      : ref.kind === "project"
        ? await db
            .query("projects")
            .withIndex("by_repo_and_numId", (q) => q.eq("repoId", repo._id).eq("numId", ref.numId))
            .first()
        : await db
            .query("sessions")
            .withIndex("by_repo_and_numId", (q) => q.eq("repoId", repo._id).eq("numId", ref.numId))
            .first();
  return doc ? await loadInboxChat(db, doc._id) : null;
}

async function chatOfTarget(
  db: DatabaseReader,
  chatTarget: string,
): Promise<InboxChat | null> {
  const chatId = db.normalizeId("sessionChats", chatTarget);
  const sessionId = chatId
    ? (await db.get(chatId))?.sessionId
    : db.normalizeId("sessions", chatTarget);
  if (sessionId) return await loadInboxChat(db, sessionId);
  const ownerId =
    db.normalizeId("agentTasks", chatTarget) ?? db.normalizeId("projects", chatTarget);
  return ownerId ? await loadInboxChat(db, ownerId) : null;
}

/**
 * Done: the chat leaves New since you looked until something newer happens
 * in it. It does not move the read time, so Undo brings the row back as it
 * was. A notification the row holds (`notificationId`) is marked read too, so
 * History does not keep it unread; Undo marks it unread again.
 */
export const markDone = authMutation({
  args: {
    chatId: inboxChatIdValidator,
    notificationId: v.optional(v.id("notifications")),
  },
  returns: v.object({
    previousDoneAt: v.optional(v.number()),
    readNotificationId: v.optional(v.id("notifications")),
  }),
  handler: async (ctx, args) => {
    const [entity, row, notification] = await Promise.all([
      ctx.db.get(args.chatId),
      getReadRow(ctx.db, ctx.userId, args.chatId),
      args.notificationId === undefined ? null : ctx.db.get(args.notificationId),
    ]);
    const repoId = entity?.repoId;
    if (repoId === undefined || !(await hasRepoAccess(ctx.db, repoId, ctx.userId))) {
      throw new Error("Not found");
    }
    const now = Date.now();
    const readNotificationId =
      notification && notification.userId === ctx.userId && !notification.read
        ? notification._id
        : undefined;
    await Promise.all([
      readNotificationId === undefined
        ? null
        : ctx.db.patch(readNotificationId, { read: true }),
      row
        ? ctx.db.patch(row._id, { doneAt: now })
        : ctx.db.insert("chatReads", {
            userId: ctx.userId,
            parentId: args.chatId,
            repoId,
            lastReadAt: now,
            doneAt: now,
          }),
    ]);
    return { previousDoneAt: row?.doneAt, readNotificationId };
  },
});

/** Undo Done: puts back the Done time `markDone` replaced, and the notification it read. */
export const undoDone = authMutation({
  args: {
    chatId: inboxChatIdValidator,
    previousDoneAt: v.optional(v.number()),
    readNotificationId: v.optional(v.id("notifications")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [row, notification] = await Promise.all([
      getReadRow(ctx.db, ctx.userId, args.chatId),
      args.readNotificationId === undefined ? null : ctx.db.get(args.readNotificationId),
    ]);
    await Promise.all([
      row ? ctx.db.patch(row._id, { doneAt: args.previousDoneAt }) : null,
      notification && notification.userId === ctx.userId
        ? ctx.db.patch(notification._id, { read: false })
        : null,
    ]);
    return null;
  },
});
