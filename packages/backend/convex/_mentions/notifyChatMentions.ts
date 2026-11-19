import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createNotification } from "../notifications";
import { formatMessagePreview } from "../_messages/preview";
import { authorDisplayName, teamMentionRecipients } from "./mentionRecipients";
import { stripMentionTokens } from "./resolveDocMentions";
import { stripSkillTokens } from "./skillToken";
import { chatOwner, sessionOwner } from "../_sessions/owner";

/**
 * Which chat a message was posted in. Carries the whole document because the
 * caller has already loaded and authorised it, and every field needed to route
 * the notification (repo, entity id) comes off it.
 */
export type ChatMentionSurface =
  | {
      kind: "session";
      session: Doc<"sessions">;
      /** The chat posted in; a project task's own chat speaks for the task. */
      chat?: Doc<"sessionChats">;
    }
  | { kind: "project"; project: Doc<"projects"> }
  | { kind: "task"; task: Doc<"agentTasks"> };

/** Reads as "... mentioned you in a session chat". */
const SURFACE_NAME: Record<ChatMentionSurface["kind"], string> = {
  session: "session",
  project: "project",
  task: "task",
};

/**
 * Entity context handed to `createNotification`, which turns it into the href
 * and the context label shown on the notification card.
 */
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

/** The chat's own title, given to routing as context for the message. */
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

/**
 * A task's or project's session notifies as its owner: the link opens the
 * task or project page.
 */
async function ownerSurface(
  ctx: MutationCtx,
  surface: ChatMentionSurface,
): Promise<ChatMentionSurface> {
  if (surface.kind !== "session") return surface;
  const owner = surface.chat
    ? chatOwner(surface.chat, surface.session)
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

/** How much of the message routing is shown. Long enough for the ask, short
 * enough that a pasted log does not dominate the judgement. */
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
    /** Tokenized message text, i.e. still containing `@[Name](userId)`. */
    content: string;
    authorUserId: Id<"users">;
    surface: ChatMentionSurface;
  },
): Promise<void> {
  // A task and its session share the repo, so the recipients need no owner
  // read; it only runs once someone is mentioned.
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

  // Routing runs after every notification exists, in one action: the judgement
  // is per mentioned person but the message and its context are shared.
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

  // Jev decides how loudly each mention is delivered. Scheduled rather than
  // awaited because it is a network call, and because a mention must land in
  // the inbox whether or not the gateway answers — see mentionRouting.ts.
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
