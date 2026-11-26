import { v } from "convex/values";
import { entityHref, getNotificationAppearance } from "@eva/shared";
import {
  INBOX_NEW_COUNT_CAP,
  inboxActionForNeedsYou,
  inboxContextLabel,
  inboxGroupForNeedsYou,
  inboxPreview,
  mergeInboxRows,
} from "@eva/shared/inbox";
import { isNeedsYouNotification } from "@eva/shared/notificationRouting";
import { splitNotificationTitle } from "@eva/shared/notificationTitle";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { collectNeedsYou, inboxRepos, type NeedsYouRow } from "./needsYou";
import { getReadRow, lastChatActivityAt } from "./chatReads";
import { findMainChat } from "./_sessionChats/helpers";
import { findWorkChat } from "./_sessions/ownerState";
import { isSessionArchived } from "./_sessions/archive";
import { sessionOwnerEntityId } from "./_sessions/owner";

/**
 * The Inbox (`@eva/shared/inbox`): one list, one row for each chat, grouped
 * by how urgent it is.
 *
 * - Holding up work and Waiting on you: the Needs you rows (`needsYou.ts`),
 *   which leave on their own once someone acts on them.
 * - New since you looked: chats the caller took part in (owns, created, posted
 *   or was @mentioned in) with activity after they last read them or pressed
 *   Done. Project membership alone does not count: Eva replies too often.
 * - Alerts: unread notifications that do not ask for the caller, in New since
 *   you looked. One about a chat folds into that chat's row.
 */

const inboxChatIdValidator = v.union(
  v.id("agentTasks"),
  v.id("projects"),
  v.id("sessions"),
);

const inboxRowValidator = v.object({
  /** The chat's owner id, or `notification:<id>` for an alert about nothing else. */
  key: v.string(),
  group: v.union(v.literal("holding"), v.literal("waiting"), v.literal("new")),
  kind: v.union(v.literal("chat"), v.literal("alert")),
  /** The source line above the title: "Checkout v2 · #902", "Quick task #88". */
  contextLabel: v.string(),
  title: v.string(),
  /** The latest message, the question, or the PR: one line. */
  preview: v.optional(v.string()),
  at: v.number(),
  /** Messages since the caller last read the chat, up to `INBOX_NEW_COUNT_CAP` + 1. */
  newCount: v.optional(v.number()),
  /** Unread: the blue dot. */
  unread: v.boolean(),
  action: v.optional(
    v.union(v.literal("answer"), v.literal("review"), v.literal("retry")),
  ),
  /** Done on a chat row: `inbox.markDone` with this id. */
  doneChatId: v.optional(inboxChatIdValidator),
  /** Done on a notification row: `notifications.archiveMany` with this id. */
  notificationId: v.optional(v.id("notifications")),
  taskId: v.optional(v.id("agentTasks")),
  prUrl: v.optional(v.string()),
  /** The web page it opens, and the Inbox pane shows. */
  href: v.optional(v.string()),
  /** The chat the phone opens (`chats.get` target). */
  chatTarget: v.optional(v.string()),
  threadRootId: v.optional(v.id("messages")),
  repoId: v.optional(v.id("githubRepos")),
});

type InboxRow = typeof inboxRowValidator.type;

/** Most read rows one repo's New since you looked looks through, newest first. */
const READ_ROW_SCAN_LIMIT = 300;
/** Most New since you looked rows the list shows. */
const NEW_ROW_LIMIT = 50;
/** Most unread notifications the alert rows look through. */
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
    preview: row.detail,
    at: row.at,
    unread: fromNotification,
    action: inboxActionForNeedsYou(row),
    // A notification that asks for you leaves when you archive it.
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

/** A read row's chat, when it is one the Inbox lists: a task, a project, or a standalone session. */
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
    // A task's or project's session is listed through its owner.
    return doc &&
      doc.owner.kind === "standalone" &&
      doc.deletedAt === undefined &&
      !isSessionArchived(doc)
      ? { kind: "session", doc }
      : null;
  }
  return null;
}

/** Took part: made the chat, or posted or was @mentioned in it. A project member alone did not. */
function tookPart(
  userId: Id<"users">,
  chat: InboxChat,
  row: Doc<"chatReads">,
): boolean {
  if (row.joinedAt !== undefined) return true;
  if (chat.kind === "task") return chat.doc.createdBy === userId;
  return chat.doc.userId === userId;
}

/**
 * In New since you looked: activity after the last Done, and either unread or
 * read since that Done (opening a row reads it; it stays until Done).
 */
function isNewSinceLooked(
  row: Doc<"chatReads">,
  activityAt: number | undefined,
): boolean {
  const doneAt = row.doneAt ?? 0;
  if (activityAt === undefined || activityAt <= doneAt) return false;
  return activityAt > row.lastReadAt || (row.seenNewAt ?? 0) > doneAt;
}

/** Chats the caller took part in, with activity they have not marked Done. */
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
      // Session chat rows are read through their session's owner row.
      const owned = reads.filter(
        (row) => db.normalizeId("sessionChats", row.parentId) === null,
      );
      const chats = await Promise.all(
        owned.map((row) => loadInboxChat(db, row.parentId)),
      );
      return owned.flatMap((row, index) => {
        const chat = chats[index];
        if (!chat || !tookPart(userId, chat, row)) return [];
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
        chat.kind === "task" && chat.doc.projectId !== undefined
          ? db.get(chat.doc.projectId).then((project) => project?.title)
          : undefined,
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

/** Title, source line, links and phone target of a chat row. */
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

/**
 * The chat's latest transcript messages (thread replies left out), newest
 * first: the first is the preview, and those after the read time are the new
 * count, capped at `INBOX_NEW_COUNT_CAP` + 1.
 */
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

/**
 * Unread notifications that do not ask for the caller (a run that finished, a
 * deploy, an automation's result). One about a chat is keyed by that chat, so
 * it folds into the chat's row when it has one.
 */
async function alertRows(
  db: DatabaseReader,
  userId: Id<"users">,
  repos: readonly Doc<"githubRepos">[],
  includeRepoless: boolean,
): Promise<InboxRow[]> {
  const repoIds = new Set(repos.map((repo) => String(repo._id)));
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
      (n.repoId === undefined ? includeRepoless : repoIds.has(String(n.repoId))),
  );
  return await Promise.all(
    unread.map(async (n): Promise<InboxRow> => {
      const { subject, event } = splitNotificationTitle(n);
      const chatKey =
        n.chatTarget === undefined ? undefined : await chatKeyOf(db, n.chatTarget);
      return {
        key: chatKey ?? `notification:${n._id}`,
        group: "new",
        kind: "alert",
        contextLabel: getNotificationAppearance(n).label,
        title: subject || n.title,
        preview: n.message ? inboxPreview(n.message) : event,
        at: n.createdAt,
        unread: true,
        notificationId: n._id,
        href: n.href,
        chatTarget: n.chatTarget,
        threadRootId: n.threadRootId,
        repoId: n.repoId,
      };
    }),
  );
}

/** A notification's chat as the Inbox keys it: the owner of a session chat or session. */
async function chatKeyOf(
  db: DatabaseReader,
  chatTarget: string,
): Promise<string | undefined> {
  const chatId = db.normalizeId("sessionChats", chatTarget);
  const sessionId = chatId
    ? (await db.get(chatId))?.sessionId
    : db.normalizeId("sessions", chatTarget);
  if (!sessionId) return chatTarget;
  const session = await db.get(sessionId);
  if (!session) return undefined;
  return sessionOwnerEntityId(session) ?? String(session._id);
}

/**
 * Done: the chat leaves New since you looked until something newer happens
 * in it. It does not move the read time, so Undo brings the row back as it was.
 */
export const markDone = authMutation({
  args: { chatId: inboxChatIdValidator },
  /** The Done time it replaced, for Undo. */
  returns: v.object({ previousDoneAt: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const [entity, row] = await Promise.all([
      ctx.db.get(args.chatId),
      getReadRow(ctx.db, ctx.userId, args.chatId),
    ]);
    const repoId = entity?.repoId;
    if (repoId === undefined || !(await hasRepoAccess(ctx.db, repoId, ctx.userId))) {
      throw new Error("Not found");
    }
    const now = Date.now();
    if (!row) {
      await ctx.db.insert("chatReads", {
        userId: ctx.userId,
        parentId: args.chatId,
        repoId,
        lastReadAt: now,
        doneAt: now,
      });
      return {};
    }
    await ctx.db.patch(row._id, { doneAt: now });
    return { previousDoneAt: row.doneAt };
  },
});

/** Undo Done: puts back the Done time `markDone` replaced. */
export const undoDone = authMutation({
  args: {
    chatId: inboxChatIdValidator,
    previousDoneAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await getReadRow(ctx.db, ctx.userId, args.chatId);
    if (row) await ctx.db.patch(row._id, { doneAt: args.previousDoneAt });
    return null;
  },
});
