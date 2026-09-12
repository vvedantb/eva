import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getCurrentUserId } from "./_auth/currentUser";
import { authMutation } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";

export const CHANGELOG_AUTOMATION_TITLE = "Eva Weekly Changelog";

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
  const matches = allAutomations.filter(
    (automation) => automation.title === CHANGELOG_AUTOMATION_TITLE,
  );
  if (matches.length === 0) return null;
  // Newest title clones must not steal the platform feed from the original.
  return matches.reduce((oldest, row) =>
    row._creationTime < oldest._creationTime ? row : oldest,
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
      content: latestRun.resultSummary,
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
              content: run.resultSummary,
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
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, {
      lastChangelogDismissedAt: Date.now(),
    });
    return null;
  },
});
