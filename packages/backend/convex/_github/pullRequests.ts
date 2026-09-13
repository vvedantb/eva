"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { components, internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { getActionRepoWithAccess } from "../functions";
import { isSandboxIdentity } from "../_auth/sandboxIdentity";

const MAX_LIST_PAGES = 3;

/** Title/author barely move, and this sits on the Reviews page critical path. */
const PR_HEADER_CACHE_TTL_MS = 60_000;

const pullRequestListItemValidator = v.object({
  number: v.number(),
  title: v.string(),
  state: v.union(v.literal("open"), v.literal("closed")),
  draft: v.boolean(),
  authorLogin: v.union(v.string(), v.null()),
  updatedAt: v.string(),
  createdAt: v.string(),
  htmlUrl: v.string(),
});

type PullRequestListItem = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  authorLogin: string | null;
  updatedAt: string;
  createdAt: string;
  htmlUrl: string;
};

const pullRequestHeaderValidator = v.object({
  number: v.number(),
  title: v.string(),
  authorLogin: v.union(v.string(), v.null()),
  htmlUrl: v.string(),
  updatedAt: v.string(),
});

type PullRequestHeader = {
  number: number;
  title: string;
  authorLogin: string | null;
  htmlUrl: string;
  updatedAt: string;
};

/**
 * Lists pull requests for the GitHub repo behind an Eva githubRepos row.
 * Codebase-wide (owner/name), not scoped to rootDirectory / app.
 */
export const listPullRequests = action({
  args: {
    repoId: v.id("githubRepos"),
    state: v.union(v.literal("open"), v.literal("closed"), v.literal("all")),
  },
  returns: v.array(pullRequestListItemValidator),
  handler: async (ctx, args): Promise<PullRequestListItem[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }

    await getActionRepoWithAccess(ctx, args.repoId);

    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    const pulls: PullRequestListItem[] = [];
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const { data } = await octokit.rest.pulls.list({
        owner: repo.owner,
        repo: repo.name,
        state: args.state,
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page,
      });
      for (const pr of data) {
        pulls.push({
          number: pr.number,
          title: pr.title,
          state: pr.state === "open" ? "open" : "closed",
          draft: pr.draft === true,
          authorLogin: pr.user?.login ?? null,
          updatedAt: pr.updated_at,
          createdAt: pr.created_at,
          htmlUrl: pr.html_url,
        });
      }
      if (data.length < 100) break;
    }

    return pulls;
  },
});

/**
 * Uncached header fetch — wrapped by ActionCache. Auth is enforced by the public
 * `getPullRequestHeader` wrapper before `fetch`.
 */
export const fetchPullRequestHeader = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
  },
  returns: pullRequestHeaderValidator,
  handler: async (ctx, args): Promise<PullRequestHeader> => {
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    const { data: pr } = await octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
    });

    return {
      number: pr.number,
      title: pr.title,
      authorLogin: pr.user?.login ?? null,
      htmlUrl: pr.html_url,
      updatedAt: pr.updated_at,
    };
  },
});

const prHeaderCache = new ActionCache(components.actionCache, {
  action: internal._github.pullRequests.fetchPullRequestHeader,
  name: "prHeaderV1",
  ttl: PR_HEADER_CACHE_TTL_MS,
});

/**
 * Lightweight PR title/meta for the Reviews detail chrome (above tabs).
 * ActionCache-backed (60s TTL); pass `force` to bypass.
 */
export const getPullRequestHeader = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    force: v.optional(v.boolean()),
  },
  returns: pullRequestHeaderValidator,
  handler: async (ctx, args): Promise<PullRequestHeader> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }

    await getActionRepoWithAccess(ctx, args.repoId);

    return await prHeaderCache.fetch(
      ctx,
      { repoId: args.repoId, prNumber: args.prNumber },
      { force: args.force === true },
    );
  },
});

/**
 * Drops the cached header for one pull request. For callers that change the
 * title on GitHub: the cached copy would otherwise keep serving the old one for
 * up to the TTL, so the rename would appear to undo itself.
 */
export async function invalidatePrHeaderCache(
  ctx: ActionCtx,
  args: { repoId: Id<"githubRepos">; prNumber: number },
): Promise<void> {
  await prHeaderCache.remove(ctx, args);
}
