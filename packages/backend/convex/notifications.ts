import {
  type MutationCtx,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v, type Infer } from "convex/values";
import { isInternalAppHref } from "@eva/shared/safeUrl";
import { entityHref, repoBasePath } from "@eva/shared";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  notificationTypeValidator,
  notificationUrgencyValidator,
  withCommentAnchor,
} from "./validators";
import { authQuery, authMutation } from "./functions";
import { schedulePush } from "./push";
import {
  notificationEmail,
  notificationEmailFor,
  notificationPushes,
  resolveNotificationPrefs,
  type RoutableNotification,
} from "@eva/shared/notificationRouting";

const DIGEST_NOTIFICATION_LIMIT = 50;

const CONTEXT_LABEL_TYPES: ReadonlySet<string> = new Set([
  "mention",
  "comment_reply",
  "routed_question",
  "thread_reply",
  "thread_answer",
]);

/**
 * Delay before an instant notification email is sent. Acts as a debounce: a
 * burst of activity within this window is swept into a single email, and the
 * send is skipped entirely if the user reads the notification in-app first.
 * Set to 15 minutes so that comment fan-out to a task's subscribers collapses
 * into one email per window rather than one per comment.
 */
export const EMAIL_SEND_DELAY_MS = 15 * 60 * 1000;

/**
 * Delay before the instant email for a `high` urgency notification. Much
 * shorter than {@link EMAIL_SEND_DELAY_MS} because routing has already spent a
 * few seconds deciding, and "the author asked you a question" is the one case
 * worth interrupting someone for.
 */
export const HIGH_URGENCY_EMAIL_DELAY_MS = 60_000;

const DIGEST_SCAN_LIMIT = 200;

/**
 * Creates a notification for a user, auto-generating an href from
 * repo/project/task/doc/session context. Returns the new row's id so a caller
 * that routes the notification afterwards (mentions → urgency) can name it.
 */
export async function createNotification(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    title: string;
    type?: Infer<typeof notificationTypeValidator>;
    message?: string;
    href?: string;
    repoId?: Id<"githubRepos">;
    projectId?: Id<"projects">;
    taskId?: Id<"agentTasks">;
    docId?: Id<"docs">;
    sessionId?: Id<"sessions">;
    commentId?: Id<"taskComments"> | Id<"docComments">;
    routesUrgency?: boolean;
    urgency?: Infer<typeof notificationUrgencyValidator>;
    threadRootId?: Id<"messages">;
  },
): Promise<Id<"notifications">> {
  const type = params.type ?? "system";

  const doc = params.docId ? await ctx.db.get(params.docId) : null;
  const task = params.taskId ? await ctx.db.get(params.taskId) : null;
  const project = params.projectId ? await ctx.db.get(params.projectId) : null;
  const session = params.sessionId ? await ctx.db.get(params.sessionId) : null;

  let href =
    params.href !== undefined && isInternalAppHref(params.href)
      ? params.href
      : undefined;
  if (!href && params.repoId) {
    const repo = await ctx.db.get(params.repoId);
    if (repo) {
      const baseHref = repoBasePath(repo);
      if (doc?.numId !== undefined) {
        href = `${baseHref}/docs/${doc.numId}/content`;
      } else if (project?.numId !== undefined && task?.numId !== undefined) {
        href = `${baseHref}/projects/${project.numId}/${task.numId}/activity`;
      } else if (task?.numId !== undefined) {
        href = entityHref("task", repo, task.numId);
      } else if (project?.numId !== undefined) {
        href = entityHref("project", repo, project.numId);
        if (params.threadRootId !== undefined) {
          href = `${href}/sandbox/replies?thread=${params.threadRootId}`;
        }
      } else if (session?.numId !== undefined) {
        href = entityHref("session", repo, session.numId);
      } else {
        href = entityHref("task", repo, undefined);
      }
    }
  }

  if (href && params.commentId) {
    href = withCommentAnchor(href, params.commentId);
  }

  let contextLabel: string | undefined;
  if (CONTEXT_LABEL_TYPES.has(type)) {
    if (doc) {
      contextLabel = doc.title;
    } else if (task) {
      contextLabel = project ? `${project.title}: ${task.title}` : task.title;
    } else if (project) {
      contextLabel = project.title;
    } else if (session) {
      contextLabel = session.title;
    }
  }
  const chatTarget = task?._id ?? session?._id ?? project?._id;
  const notificationId = await ctx.db.insert("notifications", {
    userId: params.userId,
    type,
    title: params.title,
    message: params.message,
    href,
    repoId: params.repoId,
    contextLabel,
    commentId: params.commentId,
    chatTarget,
    threadRootId: params.threadRootId,
    urgency: params.urgency,
    read: false,
    createdAt: Date.now(),
  });

  if (params.routesUrgency === true) return notificationId;
  const routable: RoutableNotification = {
    type,
    urgency: params.urgency,
    commentId: params.commentId,
    chatTarget,
  };
  if (notificationPushes(routable)) {
    await pushNotification(ctx, notificationId);
  }
  if (notificationEmail(routable) === "instant") {
    await scheduleInstantEmail(
      ctx,
      params.userId,
      params.urgency === "high"
        ? HIGH_URGENCY_EMAIL_DELAY_MS
        : EMAIL_SEND_DELAY_MS,
    );
  }
  return notificationId;
}

async function scheduleInstantEmail(
  ctx: MutationCtx,
  userId: Id<"users">,
  delayMs: number,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!resolveNotificationPrefs(user?.notificationPrefs).email) {
    return;
  }
  await ctx.scheduler.runAfter(
    delayMs,
    internal.notificationEmail.sendUnreadForUser,
    { userId },
  );
}

async function pushNotification(
  ctx: MutationCtx,
  notificationId: Id<"notifications">,
): Promise<void> {
  const notification = await ctx.db.get(notificationId);
  if (!notification) return;
  await schedulePush(ctx, {
    userId: notification.userId,
    title: notification.title,
    body: notification.message ?? notification.contextLabel,
    data: notification.chatTarget
      ? {
          target: notification.chatTarget,
          ...(notification.threadRootId
            ? { thread: notification.threadRootId }
            : {}),
        }
      : notification.href
        ? { href: notification.href, repoId: notification.repoId }
        : undefined,
  });
}

/**
 * Fans one notification out to `userIds`, skipping the actor and anyone in
 * `alreadyNotified` (e.g. reached by a higher-signal mention). Returns the
 * running set of notified ids so callers can chain their own dedup set.
 */
export async function notifyUsers(
  ctx: MutationCtx,
  userIds: Iterable<Id<"users">>,
  notification: Omit<Parameters<typeof createNotification>[1], "userId">,
  opts: { actorId?: Id<"users">; alreadyNotified?: Set<string> } = {},
): Promise<Set<string>> {
  const notified = opts.alreadyNotified ?? new Set<string>();
  for (const userId of userIds) {
    if (opts.actorId && userId === opts.actorId) continue;
    if (notified.has(userId)) continue;
    await createNotification(ctx, { ...notification, userId });
    notified.add(userId);
  }
  return notified;
}

/** Trims and truncates comment text for a notification message, or null if empty. */
export function truncateNotificationText(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

const notificationValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  userId: v.id("users"),
  type: notificationTypeValidator,
  title: v.string(),
  message: v.optional(v.string()),
  read: v.boolean(),
  href: v.optional(v.string()),
  repoId: v.optional(v.id("githubRepos")),
  createdAt: v.number(),
  contextLabel: v.optional(v.string()),
  emailedAt: v.optional(v.number()),
  commentId: v.optional(v.union(v.id("taskComments"), v.id("docComments"))),
  archivedAt: v.optional(v.number()),
  chatTarget: v.optional(v.string()),
  threadRootId: v.optional(v.id("messages")),
  urgency: v.optional(notificationUrgencyValidator),
});

/**
 * Records the urgency mention routing decided on, and delivers the chat
 * mention `createNotification` held back: `high` pushes and emails within a
 * minute, `normal` pushes and waits for the digest, `low` stays in the inbox
 * only (`@eva/shared/notificationRouting`).
 *
 * Internal use only (mentionRouting.routeMentions). Exempt from the per-row
 * owner check every public notification function makes: the id comes from the
 * routing action that was handed it at creation, not from a caller.
 */
export const setUrgency = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    urgency: notificationUrgencyValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    await deliverRoutedMention(ctx, notification, args.urgency);
    return null;
  },
});

/**
 * When Jev could not judge a mention, it is delivered as `high`: it toasts,
 * pushes and emails at once. A mention must not lose its email because the
 * judge failed (user, 26 November 2026).
 *
 * Internal use only (mentionRouting.routeMentions).
 */
export const routeMentionFallback = internalMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    await deliverRoutedMention(ctx, notification, "high");
    return null;
  },
});

async function deliverRoutedMention(
  ctx: MutationCtx,
  notification: Doc<"notifications">,
  urgency: Infer<typeof notificationUrgencyValidator>,
): Promise<void> {
  await ctx.db.patch(notification._id, { urgency });
  const routed = { ...notification, urgency };
  if (notificationPushes(routed)) {
    await pushNotification(ctx, notification._id);
  }
  if (notificationEmail(routed) === "instant") {
    await scheduleInstantEmail(
      ctx,
      notification.userId,
      HIGH_URGENCY_EMAIL_DELAY_MS,
    );
  }
}

const BULK_ID_LIMIT = 100;

async function ownedNotifications(
  ctx: MutationCtx,
  userId: Id<"users">,
  ids: Id<"notifications">[],
) {
  if (ids.length > BULK_ID_LIMIT) {
    throw new Error(
      `Too many notifications: ${ids.length} (max ${BULK_ID_LIMIT})`,
    );
  }
  const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
  const owned = [];
  for (const notification of rows) {
    if (!notification || notification.userId !== userId) continue;
    owned.push(notification);
  }
  return owned;
}

/**
 * The current user's 100 most recent notifications that are not archived
 * (the web's new-notification toasts). The window is taken before the archive
 * filter, so a run of archived rows shortens it rather than paging past them.
 */
export const list = authQuery({
  args: {
    history: v.optional(v.boolean()),
  },
  returns: v.array(notificationValidator),
  handler: async (ctx, args) => {
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(100);
    return args.history === true
      ? recent
      : recent.filter((n) => n.archivedAt === undefined);
  },
});

/**
 * Returns the number of unread notifications for the current user (capped at
 * 100). Archived rows are excluded — archiving marks a notification read, so
 * they should never sit behind the inbox badge.
 */
export const countUnread = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", ctx.userId).eq("read", false),
      )
      .take(100);
    return unread.filter((n) => n.archivedAt === undefined).length;
  },
});

/** Marks a single notification as read. */
export const markAsRead = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.userId !== ctx.userId)
      throw new Error("Not found");
    if (!notification.read) {
      await ctx.db.patch(args.id, { read: true });
    }
    return null;
  },
});

/**
 * Archives notifications out of the inbox. Reversible (see `unarchiveMany`):
 * the row stays and only `archivedAt` is stamped. Archiving also marks the
 * notification read, so an archived item cannot keep counting as unread.
 */
export const archiveMany = authMutation({
  args: { ids: v.array(v.id("notifications")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owned = await ownedNotifications(ctx, ctx.userId, args.ids);
    const now = Date.now();
    for (const n of owned) {
      if (n.archivedAt !== undefined) continue;
      await ctx.db.patch(n._id, { archivedAt: now, read: true });
    }
    return null;
  },
});

/**
 * Puts archived notifications back in the inbox. Read state is left as it is —
 * archiving marked them read, and undoing the archive should not resurface
 * them as unread.
 */
export const unarchiveMany = authMutation({
  args: { ids: v.array(v.id("notifications")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owned = await ownedNotifications(ctx, ctx.userId, args.ids);
    for (const n of owned) {
      if (n.archivedAt === undefined) continue;
      await ctx.db.patch(n._id, { archivedAt: undefined });
    }
    return null;
  },
});

/**
 * Gathers digest recipients for the daily email: every user with an email
 * address, email not turned off, and at least one unread, not yet emailed
 * notification created since `since` (`digestWindowStart`), along with up to
 * DIGEST_NOTIFICATION_LIMIT of those notifications. Internal use only (daily cron).
 */
export const getDigestRecipients = internalQuery({
  args: { since: v.number() },
  returns: v.array(
    v.object({
      email: v.string(),
      name: v.optional(v.string()),
      notifications: v.array(
        v.object({
          id: v.id("notifications"),
          title: v.string(),
          message: v.optional(v.string()),
          href: v.optional(v.string()),
          type: notificationTypeValidator,
          createdAt: v.number(),
          contextLabel: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const recipients = [];
    for (const user of users) {
      if (!user.email) continue;
      const { email } = resolveNotificationPrefs(user.notificationPrefs);
      if (!email) continue;
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_read", (q) =>
          q.eq("userId", user._id).eq("read", false),
        )
        .order("desc")
        .take(DIGEST_SCAN_LIMIT);
      const relevant = unread
        .filter(
          (n) =>
            n.createdAt >= args.since &&
            n.emailedAt === undefined &&
            notificationEmailFor(n, email) !== "none",
        )
        .slice(0, DIGEST_NOTIFICATION_LIMIT);
      if (relevant.length === 0) continue;
      recipients.push({
        email: user.email,
        name: user.firstName ?? user.fullName,
        notifications: relevant.map((n) => ({
          id: n._id,
          title: n.title,
          message: n.message,
          href: n.href,
          type: n.type,
          createdAt: n.createdAt,
          contextLabel: n.contextLabel,
        })),
      });
    }
    return recipients;
  },
});

/**
 * For an instant notification email: returns the user's unread, not-yet-emailed,
 * high-signal notifications (or null if there is nothing to send — the user
 * chose the digest or no email, has no address, or has read or been emailed
 * everything). Sweeping all pending items lets a burst within the debounce window collapse into one email.
 * Internal use only (notificationEmail.sendUnreadForUser).
 */
export const getUnreadEmailableForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      email: v.string(),
      name: v.optional(v.string()),
      notifications: v.array(
        v.object({
          id: v.id("notifications"),
          title: v.string(),
          message: v.optional(v.string()),
          href: v.optional(v.string()),
          type: notificationTypeValidator,
          createdAt: v.number(),
          contextLabel: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.email) return null;
    const { email } = resolveNotificationPrefs(user.notificationPrefs);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", args.userId).eq("read", false),
      )
      .order("desc")
      .take(DIGEST_SCAN_LIMIT);
    const relevant = unread.filter(
      (n) =>
        n.emailedAt === undefined &&
        notificationEmailFor(n, email) === "instant",
    );
    if (relevant.length === 0) return null;

    return {
      email: user.email,
      name: user.firstName ?? user.fullName,
      notifications: relevant.map((n) => ({
        id: n._id,
        title: n.title,
        message: n.message,
        href: n.href,
        type: n.type,
        createdAt: n.createdAt,
        contextLabel: n.contextLabel,
      })),
    };
  },
});

/** Stamps emailedAt on the given notifications so they are not emailed again. */
export const markEmailed = internalMutation({
  args: { notificationIds: v.array(v.id("notifications")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.notificationIds) {
      await ctx.db.patch(id, { emailedAt: now });
    }
    return null;
  },
});
