"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, components, internal } from "../_generated/api";
import { getRepoOctokit } from "../githubAuth";

const issueCardValidator = v.object({
  number: v.number(),
  title: v.string(),
  status: v.union(
    v.literal("open"),
    v.literal("completed"),
    v.literal("not_planned"),
  ),
  authorLogin: v.union(v.string(), v.null()),
  authorAvatarUrl: v.union(v.string(), v.null()),
  updatedAt: v.string(),
  comments: v.number(),
});

type IssueCard = {
  number: number;
  title: string;
  status: "open" | "completed" | "not_planned";
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  updatedAt: string;
  comments: number;
};

/** Uncached fetch, wrapped by `issueCardCache`. `getIssueCard` checks access. */
export const fetchIssueCard = internalAction({
  args: { repoId: v.id("githubRepos"), issueNumber: v.number() },
  returns: issueCardValidator,
  handler: async (ctx, args): Promise<IssueCard> => {
    const { repo, octokit } = await getRepoOctokit(ctx, args.repoId);
    const { data: issue } = await octokit.rest.issues.get({
      owner: repo.owner,
      repo: repo.name,
      issue_number: args.issueNumber,
    });
    return {
      number: issue.number,
      title: issue.title,
      status:
        issue.state === "open"
          ? "open"
          : issue.state_reason === "not_planned"
            ? "not_planned"
            : "completed",
      authorLogin: issue.user?.login ?? null,
      authorAvatarUrl: issue.user?.avatar_url ?? null,
      updatedAt: issue.updated_at,
      comments: issue.comments,
    };
  },
});

/** Same 60s TTL as the PR card: hovers repeat, issue titles rarely change. */
const issueCardCache = new ActionCache(components.actionCache, {
  action: internal._github.issues.fetchIssueCard,
  name: "issueCardV1",
  ttl: 60_000,
});

/**
 * The card for a GitHub issue link in chat, addressed as the link names it
 * (owner/name#number). Null when no repo the caller can read matches, like
 * `getPullRequestCard`.
 */
export const getIssueCard = action({
  args: { owner: v.string(), name: v.string(), issueNumber: v.number() },
  returns: v.union(issueCardValidator, v.null()),
  handler: async (ctx, args): Promise<IssueCard | null> => {
    const repoId = await ctx.runQuery(
      api.githubRepos.findAccessibleIdByOwnerAndName,
      { owner: args.owner, name: args.name },
    );
    if (repoId === null) return null;
    return await issueCardCache.fetch(ctx, {
      repoId,
      issueNumber: args.issueNumber,
    });
  },
});
