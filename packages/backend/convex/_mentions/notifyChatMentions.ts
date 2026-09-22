import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createNotification } from "../notifications";
import { formatMessagePreview } from "../_messages/preview";
import { extractMentionedUserIds } from "./extractMentionedUserIds";
import { stripMentionTokens } from "./resolveDocMentions";
import { stripSkillTokens } from "./skillToken";

/**
 * Which chat a message was posted in. Carries the whole document because the
 * caller has already loaded and authorised it, and every field needed to route
 * the notification (repo, entity id) comes off it.
 */
export type ChatMentionSurface =
  | { kind: "session"; session: Doc<"sessions"> }
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
  const mentionedUserIds = extractMentionedUserIds(ctx, args.content);
  if (mentionedUserIds.length === 0) return;

  const target = notificationTarget(args.surface);
  const repo = target.repoId ? await ctx.db.get(target.repoId) : null;
  const teamId = repo?.teamId;
  const author = await ctx.db.get(args.authorUserId);
  const authorName = author?.fullName?.trim() || "Someone";
  const title = `${authorName} mentioned you in a ${SURFACE_NAME[args.surface.kind]} chat`;
  const message = formatMessagePreview(args.content);

  // Routing runs after every notification exists, in one action: the judgement
  // is per mentioned person but the message and its context are shared.
  const routed: {
    notificationId: Id<"notifications">;
    userId: Id<"users">;
    mentionedName: string;
  }[] = [];

  for (const userId of mentionedUserIds) {
    if (userId === args.authorUserId) continue;
    if (teamId) {
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_and_user", (q) =>
          q.eq("teamId", teamId).eq("userId", userId),
        )
        .first();
      if (!membership) continue;
    }
    const notificationId = await createNotification(ctx, {
      userId,
      type: "mention",
      title,
      message,
      ...target,
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
    surface: args.surface.kind,
    entityTitle: surfaceTitle(args.surface),
  });
}
