import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { hasTeamAccess } from "../functions";
import { extractMentionedUserIds } from "./extractMentionedUserIds";

/**
 * Users `@`-mentioned in `content` who should get a mention notification.
 * Drops ids in `skip` (author, already-notified users). When the repo has a
 * team, drops non-members: the picker only offers teammates, so a non-member id
 * is stale or hand-authored, and notifying it would leak the text outside the
 * team. The repo is only read when the content has mentions.
 */
export async function teamMentionRecipients(
  ctx: QueryCtx,
  content: string,
  repoId: Id<"githubRepos"> | undefined,
  skip: ReadonlySet<string>,
): Promise<Id<"users">[]> {
  const mentioned = extractMentionedUserIds(ctx, content).filter(
    (userId) => !skip.has(userId),
  );
  if (mentioned.length === 0) return [];
  const repo = repoId ? await ctx.db.get(repoId) : null;
  const teamId = repo?.teamId;
  if (!teamId) return mentioned;
  const recipients: Id<"users">[] = [];
  for (const userId of mentioned) {
    if (await hasTeamAccess(ctx.db, teamId, userId)) recipients.push(userId);
  }
  return recipients;
}

/** Display name for the user who triggered a notification. */
export async function authorDisplayName(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<string> {
  const author = await ctx.db.get(userId);
  return author?.fullName?.trim() || "Someone";
}
