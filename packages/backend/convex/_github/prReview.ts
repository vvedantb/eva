"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { getActionRepoWithAccess } from "../functions";
import { isSandboxIdentity } from "../_auth/sandboxIdentity";

const reviewSideValidator = v.union(v.literal("LEFT"), v.literal("RIGHT"));

/**
 * One inline comment, already resolved to GitHub's anchor model: a line number
 * on one side of the diff, optionally starting at an earlier line for a
 * multi-line comment. `LEFT` is the base file, `RIGHT` the head file.
 */
const reviewCommentInputValidator = v.object({
  path: v.string(),
  body: v.string(),
  line: v.number(),
  side: reviewSideValidator,
  /** Null for a single-line comment. */
  startLine: v.union(v.number(), v.null()),
  startSide: v.union(reviewSideValidator, v.null()),
});

/**
 * Posts a pull request review — an overall body plus inline comments — as the
 * eva GitHub App. GitHub validates the anchors and the event (it refuses to
 * approve a PR the app itself opened, for instance), so failures are thrown
 * with GitHub's own message rather than being second-guessed here.
 */
export const submitPrReview = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    event: v.union(
      v.literal("COMMENT"),
      v.literal("APPROVE"),
      v.literal("REQUEST_CHANGES"),
    ),
    body: v.string(),
    comments: v.array(reviewCommentInputValidator),
  },
  returns: v.object({
    reviewId: v.number(),
    htmlUrl: v.string(),
    /** APPROVED | CHANGES_REQUESTED | COMMENTED */
    state: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ reviewId: number; htmlUrl: string; state: string }> => {
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

    const body = args.body.trim();
    const octokit = await getInstallationOctokit(repo.installationId);
    const { data } = await octokit.rest.pulls.createReview({
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
      event: args.event,
      body: body.length > 0 ? body : undefined,
      comments:
        args.comments.length > 0
          ? args.comments.map((comment) => ({
              path: comment.path,
              body: comment.body,
              line: comment.line,
              side: comment.side,
              start_line: comment.startLine ?? undefined,
              start_side: comment.startSide ?? undefined,
            }))
          : undefined,
    });

    return {
      reviewId: data.id,
      htmlUrl: data.html_url,
      state: data.state,
    };
  },
});

/**
 * Posts a plain conversation comment, as the eva GitHub App. Pull request
 * comments are issue comments as far as the API is concerned, which is why this
 * does not go through the review endpoints: a comment is not a verdict, and
 * sending it as one would show up on GitHub as a review.
 */
export const addPrComment = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    body: v.string(),
  },
  returns: v.object({
    id: v.number(),
    htmlUrl: v.string(),
  }),
  handler: async (ctx, args): Promise<{ id: number; htmlUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }

    await getActionRepoWithAccess(ctx, args.repoId);

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Comment cannot be empty");

    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    const { data } = await octokit.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.name,
      issue_number: args.prNumber,
      body,
    });

    return { id: data.id, htmlUrl: data.html_url };
  },
});
