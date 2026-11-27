import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createNotification } from "../notifications";
import { formatMessagePreview } from "../_messages/preview";
import { authorDisplayName, teamMentionRecipients } from "./mentionRecipients";
import { stripMentionTokens } from "./resolveDocMentions";
import { stripSkillTokens } from "./skillToken";
import { sessionOwner } from "../_sessions/owner";
import { isNeedsYouNotification } from "@eva/shared/notificationRouting";

/**
 * Which chat a message was posted in. Carries the whole document because the
 * caller has already loaded and authorised it, and every field needed to route
 * the notification (repo, entity id) comes off it.
 */
export type ChatMentionSurface =
  | {
      kind: "session";
      session: Doc<"sessions">;
      chat?: Doc<"sessionChats">;
    }
  | { kind: "project"; project: Doc<"projects"> }
  | { kind: "task"; task: Doc<"agentTasks"> };

const SURFACE_NAME: Record<ChatMentionSurface["kind"], string> = {
  session: "session",
  project: "project",
  task: "task",
};

function notificationTarget(surface: ChatMentionSurface): {
  repoId?: Id<"githubRepos">;
  sessionId?: Id<"sessions">;
  projectId?: Id<"projects">;
  taskId?: Id<"agentTasks">;
} {
  switch (surface.kind) {
    case "session":
      return { repoId: surface.session.repoId, sessionId: surface.session._id };
    case "project":
      return { repoId: surface.project.repoId, projectId: surface.project._id };
    case "task":
      return {
        repoId: surface.task.repoId,
        projectId: surface.task.projectId,
        taskId: surface.task._id,
      };
  }
}

function surfaceTitle(surface: ChatMentionSurface): string {
  switch (surface.kind) {
    case "session":
      return surface.session.title;
    case "project":
      return surface.project.title;
    case "task":
      return surface.task.title;
  }
}

async function ownerSurface(
  ctx: MutationCtx,
  surface: ChatMentionSurface,
): Promise<ChatMentionSurface> {
  if (surface.kind !== "session") return surface;
  const owner = surface.chat
    ? sessionOwner(surface.session)
    : sessionOwner(surface.session);
  if (owner.kind === "task") {
    const task = await ctx.db.get(owner.taskId);
    return task ? { kind: "task", task } : surface;
  }
  if (owner.kind === "project") {
    const project = await ctx.db.get(owner.projectId);
    return project ? { kind: "project", project } : surface;
  }
  return surface;
}

const OWN_MENTIONS_SCAN = 100;

async function answerOwnChatMentions(
  ctx: MutationCtx,
  userId: Id<"users">,
  surface: ChatMentionSurface,
): Promise<void> {
  const unread = (
    await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .order("desc")
      .take(OWN_MENTIONS_SCAN)
  ).filter(isNeedsYouNotification);
  if (unread.length === 0) return;
  const target = notificationTarget(await ownerSurface(ctx, surface));
  const chatTarget = target.taskId ?? target.sessionId ?? target.projectId;
  for (const row of unread) {
    if (row.chatTarget === chatTarget) {
      await ctx.db.patch(row._id, { read: true });
    }
  }
}

const ROUTING_MESSAGE_LIMIT = 4000;

/**
 * Notifies every teammate `@`-mentioned in a chat message.
 *
 * Called from the three chat `submitTurn` mutations, which sit upstream of both
 * the "runs now" and the "queued behind the current turn" write paths — so a
 * mention notifies at submit time regardless of what the agent is doing.
 *
 * Mentions are only honoured for members of the repo's team. The mention picker
 * only offers teammates, so a non-member id means hand-authored or stale
 * tokenized text, and notifying on it would leak the message body outside the
 * team.
 */
export async function notifyChatMentions(
  ctx: MutationCtx,
  args: {
    content: string;
    authorUserId: Id<"users">;
    surface: ChatMentionSurface;
  },
): Promise<void> {
  await answerOwnChatMentions(ctx, args.authorUserId, args.surface);
  const recipients = await teamMentionRecipients(
    ctx,
    args.content,
    notificationTarget(args.surface).repoId,
    new Set([args.authorUserId]),
  );
  if (recipients.length === 0) return;

  const [surface, authorName] = await Promise.all([
    ownerSurface(ctx, args.surface),
    authorDisplayName(ctx, args.authorUserId),
  ]);
  const target = notificationTarget(surface);
  const title = `${authorName} mentioned you in a ${SURFACE_NAME[surface.kind]} chat`;
  const message = formatMessagePreview(args.content);

  const routed: {
    notificationId: Id<"notifications">;
    userId: Id<"users">;
    mentionedName: string;
  }[] = [];

  for (const userId of recipients) {
    const notificationId = await createNotification(ctx, {
      userId,
      type: "mention",
      title,
      message,
      ...target,
      routesUrgency: true,
    });
    const mentioned = await ctx.db.get(userId);
    routed.push({
      notificationId,
      userId,
      mentionedName: mentioned?.fullName?.trim() || "them",
    });
  }

  if (routed.length === 0) return;

  await ctx.scheduler.runAfter(0, internal.mentionRouting.routeMentions, {
    items: routed,
    message: stripSkillTokens(stripMentionTokens(args.content)).slice(
      0,
      ROUTING_MESSAGE_LIMIT,
    ),
    authorName,
    surface: surface.kind,
    entityTitle: surfaceTitle(surface),
  });
}

/**
 * Tells the people already in a reply thread (the root's author and earlier
 * repliers) that someone replied. Those @-mentioned in the reply are skipped:
 * `notifyChatMentions` already told them.
 */
export async function notifyThreadReply(
  ctx: MutationCtx,
  args: {
    content: string;
    authorUserId: Id<"users">;
    participantIds: readonly Id<"users">[];
    surface: ChatMentionSurface;
  },
): Promise<void> {
  const target = notificationTarget(args.surface);
  const mentioned = new Set(
    await teamMentionRecipients(ctx, args.content, target.repoId, new Set()),
  );
  const recipients = [...new Set(args.participantIds)].filter(
    (userId) => userId !== args.authorUserId && !mentioned.has(userId),
  );
  if (recipients.length === 0) return;
  const [surface, authorName] = await Promise.all([
    ownerSurface(ctx, args.surface),
    authorDisplayName(ctx, args.authorUserId),
  ]);
  const title = `${authorName} replied in a thread`;
  const message = formatMessagePreview(args.content);
  for (const userId of recipients) {
    await createNotification(ctx, {
      userId,
      type: "comment_reply",
      title,
      message,
      ...notificationTarget(surface),
    });
  }
}
