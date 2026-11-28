import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { filterActiveEntities } from "./numId";
import { DAILY_STANDUP_KEY } from "./_automations/systemAutomations";

const ENTRY_LIMIT = 31;

async function findStandupAutomation(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
): Promise<Doc<"automations"> | null> {
  const rows = filterActiveEntities(
    await db
      .query("automations")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .collect(),
  );
  return rows.find((row) => row.systemKey === DAILY_STANDUP_KEY) ?? null;
}

type StandupEntry = {
  id: Id<"automationRuns">;
  content: string;
  publishedAt: number;
};

async function publishedStandups(
  db: DatabaseReader,
  automationId: Id<"automations">,
): Promise<StandupEntry[]> {
  const runs = await db
    .query("automationRuns")
    .withIndex("by_automation_and_status", (q) =>
      q.eq("automationId", automationId).eq("status", "success"),
    )
    .order("desc")
    .take(ENTRY_LIMIT);
  return runs.flatMap((run) =>
    run.resultSummary && run.finishedAt
      ? [{ id: run._id, content: run.resultSummary, publishedAt: run.finishedAt }]
      : [],
  );
}

function getStandupRead(
  db: DatabaseReader,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
): Promise<Doc<"standupReads"> | null> {
  return db
    .query("standupReads")
    .withIndex("by_user_repo", (q) =>
      q.eq("userId", userId).eq("repoId", repoId),
    )
    .unique();
}

/**
 * Today for this user: `enabled` while the standup automation is on (the tab
 * shows), and `unreadAt` — the newest standup's publish time while the user
 * has not opened Today since it landed, else null. A paused standup is never
 * unread, as its tab is hidden.
 */
export const standupStatus = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({
    enabled: v.boolean(),
    unreadAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const off = { enabled: false, unreadAt: null };
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return off;
    const automation = await findStandupAutomation(ctx.db, args.repoId);
    if (automation?.enabled !== true) return off;
    const [latest] = await publishedStandups(ctx.db, automation._id);
    const read = await getStandupRead(ctx.db, ctx.userId, args.repoId);
    const unread =
      latest !== undefined && latest.publishedAt > (read?.lastReadAt ?? 0);
    return { enabled: true, unreadAt: unread ? latest.publishedAt : null };
  },
});

/** The user opened Today: every standup published so far is now read. */
export const markStandupsRead = authMutation({
  args: { repoId: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const now = Date.now();
    const read = await getStandupRead(ctx.db, ctx.userId, args.repoId);
    if (read) {
      await ctx.db.patch(read._id, { lastReadAt: now });
    } else {
      await ctx.db.insert("standupReads", {
        userId: ctx.userId,
        repoId: args.repoId,
        lastReadAt: now,
      });
    }
    return null;
  },
});

/**
 * Every published standup of this repo, newest first, for the Today page.
 * Deliberately ignores `enabled` — pausing the automation hides the tab but
 * keeps the history reachable by URL.
 */
export const listStandups = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      id: v.id("automationRuns"),
      content: v.string(),
      publishedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }
    const automation = await findStandupAutomation(ctx.db, args.repoId);
    if (!automation) return [];

    return publishedStandups(ctx.db, automation._id);
  },
});
