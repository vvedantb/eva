"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";

/**
 * Reads one tracked PR's live state, title and branches from GitHub and writes
 * them onto its row. Used by `backfillPullRequests`, whose sources (old run
 * rows) never recorded a PR's state. Best-effort: a failure leaves the
 * inferred state, which the next webhook for that PR corrects.
 */
export const refreshFromGitHub = internalAction({
  args: { prUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.pullRequests.getByUrlInternal, {
      prUrl: args.prUrl,
    });
    if (!row) return null;
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: row.repoId,
    });
    if (!repo) return null;
    try {
      const octokit = await getInstallationOctokit(repo.installationId);
      const { data } = await octokit.rest.pulls.get({
        owner: repo.owner,
        repo: repo.name,
        pull_number: row.prNumber,
      });
      await ctx.runMutation(internal.pullRequests.applyGitHubSnapshot, {
        prUrl: row.prUrl,
        state: data.merged
          ? "merged"
          : data.state === "closed"
            ? "closed"
            : data.draft
              ? "draft"
              : "open",
        title: data.title,
        headBranch: data.head.ref,
        baseBranch: data.base.ref,
      });
    } catch (error) {
      console.error(
        `[pullRequests] refresh failed for ${row.prUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});
