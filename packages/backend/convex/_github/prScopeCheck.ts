"use node";

/**
 * Publishes the scope-check summary into a pull request body.
 *
 * Reads the PR's own commit list and asks for every verdict recorded against
 * those shas, so the warning follows the commits rather than the chat. That is
 * the case the chip missed: a trophy icon nobody asked for reached production
 * through a PR a person opened by copying Eva's files onto a clean branch,
 * where there was no Eva chat to show a chip on.
 *
 * Best-effort throughout. A missing PR, a GitHub failure or a body that has not
 * changed leaves the PR exactly as it was — this must never block a merge or
 * fail the turn that triggered it.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getInstallationOctokit } from "../githubAuth";
import { extractPrNumber } from "./prUrl";
import { getPullRequest, patchPullRequest } from "./pullRequestWrite";
import { upsertScopeSection } from "./prScopeSection";

/** GitHub caps `listCommits` at 250 for a PR; one page of 100 covers ours. */
const COMMIT_PAGE_SIZE = 100;

/**
 * Same publish, for a PR Eva did not open — the webhook knows the repo by
 * owner and name, not by id. Monorepo app rows share one GitHub repo and one
 * installation, so the first row is as good as any.
 */
export const publishScopeSectionForPr = internalAction({
  args: { prUrl: v.string(), owner: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repoIds = await ctx.runQuery(
      internal.githubRepos.listRepoIdsByOwnerAndName,
      { owner: args.owner, name: args.name },
    );
    const [repoId] = repoIds;
    if (repoId === undefined) return null;
    await ctx.runAction(internal.github.publishScopeSection, {
      repoId,
      prUrl: args.prUrl,
    });
    return null;
  },
});

export const publishScopeSection = internalAction({
  args: { repoId: v.id("githubRepos"), prUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prNumber = extractPrNumber(args.prUrl);
    if (prNumber === null) return null;

    try {
      const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
        id: args.repoId,
      });
      if (!repo) return null;
      const octokit = await getInstallationOctokit(repo.installationId);
      const target = {
        owner: repo.owner,
        repo: repo.name,
        pull_number: prNumber,
      };

      const commits = await octokit.rest.pulls.listCommits({
        ...target,
        per_page: COMMIT_PAGE_SIZE,
      });
      const shas = commits.data.map((commit) => commit.sha);
      if (shas.length === 0) return null;

      const rows = await ctx.runQuery(
        internal._scopeCheck.queries.flaggedForShas,
        { shas },
      );

      const pr = await getPullRequest(octokit, target);
      const body = pr.body ?? "";
      const next = upsertScopeSection(body, rows);
      // A no-op patch still writes a PR event and emails every watcher.
      if (next === body) return null;
      await patchPullRequest(octokit, target, { body: next });
    } catch (error) {
      console.error("[scope-pr]", args.prUrl, error);
    }
    return null;
  },
});
