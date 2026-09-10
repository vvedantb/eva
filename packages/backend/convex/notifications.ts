import {
  type MutationCtx,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { notificationTypeValidator, withCommentAnchor } from "./validators";
import { authQuery, authMutation } from "./functions";

/** Max unread notifications shown per user in the daily digest email. */
const DIGEST_NOTIFICATION_LIMIT = 50;

/**
 * Notification types worth an instant (debounced) email — high-signal, human-
 * directed activity. Everything else waits for the daily digest. Lower-signal
 * types (run/task completion, system) are intentionally absent.
 */
const EMAIL_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "mention",
  "comment_reply",
  "comment_added",
  "task_assigned",
]);

/**
 * Notification types whose title does not name the task (e.g. "X mentioned you
 * in a comment", "X replied to your comment"). Only these get a contextLabel
 * second line on the card. Every other type already embeds the task title in
 * its own title, so a context line would just repeat it.
 */
const CONTEXT_LABEL_TYPES: ReadonlySet<string> = new Set([
  "mention",
  "comment_reply",
]);

/**
 * Delay before an instant notification email is sent. Acts as a debounce: a
 * burst of activity within this window is swept into a single email, and the
 * send is skipped entirely if the user reads the notification in-app first.
 * Set to 15 minutes so that comment fan-out to a task's subscribers collapses
 * into one email per window rather than one per comment.
 */
const EMAIL_SEND_DELAY_MS = 15 * 60 * 1000;

/**
 * How many unread notifications to scan per user before filtering. Larger than
 * the display limit so impactful items (mentions, merges) are not buried under
 * a backlog of excluded run-completion notifications.
 */
const DIGEST_SCAN_LIMIT = 200;

/**
 * Notification types excluded from the daily digest. Task/quick-task run
 * finished notifications ("run_completed") are high-volume and low-signal in an
 * email summary; they remain in the in-app notification bell.
 */
const DIGEST_EXCLUDED_TYPES: ReadonlySet<string> = new Set([
  "run_completed",
  "run_failed",
  // Change requests show in-app only — they re-run Eva, which is low-signal in
  // an email summary.
  "changes_requested",
  // Session auto-archive on PR close/merge is inbox-only; never email.
  "session_archived",
]);

/** Builds a URL path for a repo, including app name for monorepo sub-apps. */
function getRepoHref(
  owner: string,
  name: string,
  rootDirectory?: string,
): string {
  if (!rootDirectory) return `/${owner}/${name}`;
  const appName = rootDirectory.split("/").pop();
  return `/${owner}/${name}/${appName}`;
}

/** Creates a notification for a user, auto-generating an href from repo/project/task/doc/session context. */
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
    // Set by the comment paths (task comments, doc comments). Anchors the
    // click-through to the exact comment rather than the top of the page.
    commentId?: Id<"taskComments"> | Id<"docComments">;
  },
) {
  const type = params.type ?? "system";

  // Fetched once and shared: the href and the context label below are both
  // derived from whichever entity the notification is about.
  const doc = params.docId ? await ctx.db.get(params.docId) : null;
  const task = params.taskId ? await ctx.db.get(params.taskId) : null;
  const project = params.projectId ? await ctx.db.get(params.projectId) : null;
  const session = params.sessionId ? await ctx.db.get(params.sessionId) : null;

  let href = params.href;
  if (!href && params.repoId) {
    const repo = await ctx.db.get(params.repoId);
    if (repo) {
      const baseHref = getRepoHref(repo.owner, repo.name, repo.rootDirectory);
      // Detail routes are keyed by per-repo numId, not by Convex id — a Convex
      // id in the path fails `parseRouteNumId` and renders "not found". An
      // entity still awaiting numId backfill falls through to its section list.
      if (doc?.numId !== undefined) {
        href = `${baseHref}/docs/${doc.numId}/content`;
      } else if (project?.numId !== undefined && task?.numId !== undefined) {
        href = `${baseHref}/projects/${project.numId}/${task.numId}/activity`;
      } else if (task?.numId !== undefined) {
        href = `${baseHref}/quick-tasks/${task.numId}`;
      } else if (project?.numId !== undefined) {
        href = `${baseHref}/projects/${project.numId}`;
      } else if (session?.numId !== undefined) {
        href = `${baseHref}/sessions/${session.numId}`;
      } else {
        href = `${baseHref}/quick-tasks`;
      }
    }
  }

  // Anchor the click-through to the comment that caused the notification. Done
  // after href resolution so it covers both the derived href and one passed in
  // by the caller.
  if (href && params.commentId) {
    href = withCommentAnchor(href, params.commentId);
  }

  // Snapshot a human-readable context label for the notification card, but only
  // for types whose title does not already name the entity.
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
  await ctx.db.insert("notifications", {
    userId: params.userId,
    type,
    title: params.title,
    message: params.message,
    href,
    repoId: params.repoId,
    contextLabel,
    commentId: params.commentId,
    read: false,
    createdAt: Date.now(),
  });

  // High-signal types get an instant email after a short debounce. The send is
  // skipped if the user reads it in-app first (see notificationEmail.ts).
  if (EMAIL_NOTIFICATION_TYPES.has(type)) {
    await ctx.scheduler.runAfter(
      EMAIL_SEND_DELAY_MS,
      internal.notificationEmail.sendUnreadForUser,
      { userId: params.userId },
    );
  }
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
});

/** Lists the 100 most recent notifications for the current user. */
export const list = authQuery({
  args: {},
  returns: v.array(notificationValidator),
  handler: async (ctx) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(100);
  },
});

/** Fetches a single notification by ID, only if it belongs to the current user. */
export const get = authQuery({
  args: { id: v.id("notifications") },
  returns: v.union(notificationValidator, v.null()),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.userId !== ctx.userId) return null;
    return notification;
  },
});

/** Returns the number of unread notifications for the current user (capped at 100). */
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
    return unread.length;
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
 * Marks a single notification as unread again (inbox right-click menu). Read
 * state is the `read` boolean alone — there is no timestamp to clear.
 */
export const markAsUnread = authMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.userId !== ctx.userId)
      throw new Error("Not found");
    if (notification.read) {
      await ctx.db.patch(args.id, { read: false });
    }
    return null;
  },
});

/** Marks all unread notifications as read for the current user. */
export const markAllAsRead = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", ctx.userId).eq("read", false),
      )
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
    return null;
  },
});

/**
 * Gathers digest recipients for the daily email: every user with an email address
 * and at least one unread notification created since `since` (the digest window,
 * typically the past 24 hours), along with up to DIGEST_NOTIFICATION_LIMIT of
 * those notifications. Internal use only (daily cron).
 */
export const getDigestRecipients = internalQuery({
  args: { since: v.number() },
  returns: v.array(
    v.object({
      email: v.string(),
      name: v.optional(v.string()),
      notifications: v.array(
        v.object({
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
      if (user.emailNotificationsEnabled !== true) continue;
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
            !DIGEST_EXCLUDED_TYPES.has(n.type) &&
            n.emailedAt === undefined,
        )
        .slice(0, DIGEST_NOTIFICATION_LIMIT);
      if (relevant.length === 0) continue;
      recipients.push({
        email: user.email,
        name: user.firstName ?? user.fullName,
        notifications: relevant.map((n) => ({
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
 * high-signal notifications (or null if there is nothing to send — user opted
 * out, has no email, or has already read/been emailed everything). Sweeping all
 * pending items lets a burst within the debounce window collapse into one email.
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
    if (user.emailNotificationsEnabled !== true) return null;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", args.userId).eq("read", false),
      )
      .order("desc")
      .take(DIGEST_SCAN_LIMIT);
    const relevant = unread.filter(
      (n) => EMAIL_NOTIFICATION_TYPES.has(n.type) && n.emailedAt === undefined,
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
