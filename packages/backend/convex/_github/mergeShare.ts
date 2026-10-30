"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { getActionRepoWithAccess } from "../functions";

/** 30 pages of 100 closed PRs covers a busy repo's 90 days; older buckets go blank. */
const MAX_CLOSED_PR_PAGES = 30;

/** Merges trickle in all day; ten minutes keeps the Stats page cheap and close to live. */
const MERGED_PRS_CACHE_TTL_MS = 10 * 60_000;

const mergedPrValidator = v.object({
  number: v.number(),
  mergedAt: v.number(),
  /** Author is a GitHub bot account (Dependabot, Renovate, an App). */
  bot: v.boolean(),
});

const mergedPrsResultValidator = v.object({
  prs: v.array(mergedPrValidator),
  /**
   * Merges before this time may be missing because the page cap was hit;
   * equal to `since` when the list is complete.
   */
  coveredFrom: v.number(),
});

type MergedPrsResult = {
  prs: Array<{ number: number; mergedAt: number; bot: boolean }>;
  coveredFrom: number;
};

/**
 * Uncached list of every PR merged since `since` — wrapped by ActionCache.
 * Auth is enforced by the public `getEvaMergeShare` wrapper before `fetch`.
 *
 * Walks closed PRs by `updated` descending: a PR's merge time is never after
 * its last update, so once a page reaches `since` nothing older can qualify.
 */
export const fetchMergedPrs = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    since: v.number(),
  },
  returns: mergedPrsResultValidator,
  handler: async (ctx, args): Promise<MergedPrsResult> => {
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    const prs: MergedPrsResult["prs"] = [];
    for (let page = 1; page <= MAX_CLOSED_PR_PAGES; page++) {
      const { data } = await octokit.rest.pulls.list({
        owner: repo.owner,
        repo: repo.name,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page,
      });
      for (const pr of data) {
        if (pr.merged_at === null) continue;
        const mergedAt = Date.parse(pr.merged_at);
        if (mergedAt < args.since) continue;
        prs.push({
          number: pr.number,
          mergedAt,
          bot: pr.user?.type === "Bot",
        });
      }
      const last = data.at(-1);
      if (
        data.length < 100 ||
        last === undefined ||
        Date.parse(last.updated_at) < args.since
      ) {
        return { prs, coveredFrom: args.since };
      }
      if (page === MAX_CLOSED_PR_PAGES) {
        return { prs, coveredFrom: Date.parse(last.updated_at) };
      }
    }
    return { prs, coveredFrom: args.since };
  },
});

const mergedPrsCache = new ActionCache(components.actionCache, {
  action: internal._github.mergeShare.fetchMergedPrs,
  name: "mergedPrsV1",
  ttl: MERGED_PRS_CACHE_TTL_MS,
});

/**
 * Share of merged PRs that Eva opened, per time bucket, for the Stats page.
 *
 * Eva PRs are the repo's `pullRequests` rows (every one sits on an Eva
 * branch). The total counts every merged PR except bot-authored ones; an Eva
 * PR always counts, even when a GitHub App account authored it. GitHub's
 * `merged_at` dates both sides so they share one clock.
 */
export const getEvaMergeShare = action({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.number(),
    /** Right edge of the chart — the last bucket is the one containing it. */
    endTime: v.number(),
    bucketSizeMs: v.number(),
    force: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      date: v.number(),
      evaMerged: v.number(),
      totalMerged: v.number(),
      /** False when the bucket starts before the fetched history reaches. */
      covered: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await getActionRepoWithAccess(ctx, args.repoId);

    const [merged, evaPrNumbers] = await Promise.all([
      mergedPrsCache.fetch(
        ctx,
        { repoId: args.repoId, since: args.startTime },
        { force: args.force === true },
      ),
      ctx.runQuery(internal.analytics.listEvaPrNumbers, {
        repoId: args.repoId,
      }),
    ]);
    const evaNumbers = new Set(evaPrNumbers);

    const buckets: Array<{
      date: number;
      evaMerged: number;
      totalMerged: number;
      covered: boolean;
    }> = [];
    for (let t = args.startTime; t <= args.endTime; t += args.bucketSizeMs) {
      buckets.push({
        date: t,
        evaMerged: 0,
        totalMerged: 0,
        covered: t >= merged.coveredFrom,
      });
    }
    for (const pr of merged.prs) {
      const isEva = evaNumbers.has(pr.number);
      if (pr.bot && !isEva) continue;
      const bucket =
        buckets[Math.floor((pr.mergedAt - args.startTime) / args.bucketSizeMs)];
      if (!bucket) continue;
      bucket.totalMerged++;
      if (isEva) bucket.evaMerged++;
    }
    return buckets;
  },
});
