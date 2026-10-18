import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { getCurrentUserId } from "./_auth/currentUser";
import { authMutation } from "./functions";
import { changelogVoteFields } from "./validators";
import {
  CHANGELOG_AUTOMATION_TITLE,
  changelogDisplayMarkdown,
  parseChangelog,
} from "./_changelog/entry";

/** Roughly a year of a weekly automation — deep enough to never need paging. */
const ENTRY_LIMIT = 50;

/**
 * The changelog automation, found by title across every repo — there is exactly
 * one, and which repo owns it is an implementation detail of how it was set up.
 */
async function findChangelogAutomation(
  db: GenericDatabaseReader<DataModel>,
): Promise<Doc<"automations"> | null> {
  const allAutomations = await db.query("automations").collect();
  return (
    allAutomations.find((a) => a.title === CHANGELOG_AUTOMATION_TITLE) ?? null
  );
}

/**
 * Returns the latest successful changelog automation run and whether the
 * current user should see the popup (i.e. they haven't dismissed it yet).
 * Uses a plain query so it returns null for unauthenticated users instead
 * of throwing — this lets the component live in the root layout.
 */
export const getLatestChangelog = query({
  args: {},
  returns: v.union(
    v.object({
      show: v.boolean(),
      content: v.string(),
      publishedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;

    const automation = await findChangelogAutomation(ctx.db);
    if (!automation) return null;

    const latestRun = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_and_status", (q) =>
        q.eq("automationId", automation._id).eq("status", "success"),
      )
      .order("desc")
      .first();

    if (!latestRun?.resultSummary || !latestRun.finishedAt) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const dismissed = user.lastChangelogDismissedAt ?? 0;

    return {
      show: latestRun.finishedAt > dismissed,
      content: changelogDisplayMarkdown(latestRun.resultSummary),
      publishedAt: latestRun.finishedAt,
    };
  },
});

/**
 * Every published changelog entry, newest first, for the `/whats-new` page.
 * Plain query (like `getLatestChangelog`) so an unauthenticated render returns
 * an empty list rather than throwing while auth hydrates.
 */
export const listChangelog = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("automationRuns"),
      content: v.string(),
      publishedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return [];

    const automation = await findChangelogAutomation(ctx.db);
    if (!automation) return [];

    const runs = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_and_status", (q) =>
        q.eq("automationId", automation._id).eq("status", "success"),
      )
      .order("desc")
      .take(ENTRY_LIMIT);

    // A successful run can still finish without a summary (nothing shipped that
    // week); those have nothing to render, so drop them rather than show blanks.
    return runs.flatMap((run) =>
      run.resultSummary && run.finishedAt
        ? [
            {
              id: run._id,
              content: changelogDisplayMarkdown(run.resultSummary),
              publishedAt: run.finishedAt,
            },
          ]
        : [],
    );
  },
});

/** Marks the current user as having dismissed the latest changelog. */
export const dismissChangelog = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.patch(ctx.userId, {
      lastChangelogDismissedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Records one recipient's feedback on a changelog run (an item vote, or a
 * whole-email rating when `itemIndex` is absent), replacing any earlier one.
 * The HTTP route has already checked the link signature. Returns false when
 * the run or item no longer exists, so the route can say so.
 */
export const recordVote = internalMutation({
  args: {
    runId: v.string(),
    userId: v.string(),
    itemIndex: changelogVoteFields.itemIndex,
    vote: changelogVoteFields.vote,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const runId = ctx.db.normalizeId("automationRuns", args.runId);
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!runId || !userId) return false;
    const run = await ctx.db.get(runId);
    const changelog = run?.resultSummary
      ? parseChangelog(run.resultSummary)
      : null;
    if (!changelog) return false;
    if (args.itemIndex !== undefined && args.itemIndex >= changelog.items.length)
      return false;

    const existing = await ctx.db
      .query("changelogVotes")
      .withIndex("by_run_and_user_and_item", (q) =>
        q
          .eq("runId", runId)
          .eq("userId", userId)
          .eq("itemIndex", args.itemIndex),
      )
      .unique();
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { vote: args.vote, updatedAt });
    } else {
      await ctx.db.insert("changelogVotes", {
        runId,
        userId,
        itemIndex: args.itemIndex,
        vote: args.vote,
        updatedAt,
      });
    }
    return true;
  },
});
