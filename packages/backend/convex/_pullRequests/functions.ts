import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authQuery, hasRepoAccess, hasTaskAccess } from "../functions";
import { sandboxOwnerValidator } from "../_sandbox/owner";
import {
  prOriginValidator,
  prOwnerValidator,
  prStateValidator,
  pullRequestFields,
} from "../validators";
import {
  findPullRequestByUrl,
  listOwnerPullRequests,
  recordPullRequest,
  setPullRequestState,
  type PrOwnerRef,
} from "./store";

const pullRequestValidator = v.object({
  _id: v.id("pullRequests"),
  _creationTime: v.number(),
  ...pullRequestFields,
});

/** One row of the Review pane's Pull requests tab. */
const pullRequestListItemValidator = v.object({
  _id: v.id("pullRequests"),
  prUrl: v.string(),
  prNumber: v.number(),
  title: v.optional(v.string()),
  state: prStateValidator,
  primary: v.boolean(),
  origin: prOriginValidator,
  headBranch: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  repoId: v.id("githubRepos"),
  repoOwner: v.string(),
  repoName: v.string(),
  /** True for a multi-repo session's linked-repo PR. */
  linkedRepo: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function canReadOwner(
  db: DatabaseReader,
  owner: PrOwnerRef,
  userId: Id<"users">,
): Promise<boolean> {
  if (owner.kind === "session") {
    const session = await db.get(owner.sessionId);
    return session !== null && (await hasRepoAccess(db, session.repoId, userId));
  }
  if (owner.kind === "task") {
    const task = await db.get(owner.taskId);
    return task !== null && (await hasTaskAccess(db, task, userId));
  }
  const project = await db.get(owner.projectId);
  return project !== null && (await hasRepoAccess(db, project.repoId, userId));
}

/**
 * Every PR linked to a session, quick task or project, primary first, then
 * newest first. Stored data only — no GitHub calls — so the tab is one
 * subscription however many PRs the owner holds.
 */
export const listForOwner = authQuery({
  args: { owner: sandboxOwnerValidator },
  returns: v.array(pullRequestListItemValidator),
  handler: async (ctx, args) => {
    if (!(await canReadOwner(ctx.db, args.owner, ctx.userId))) return [];
    const rows = await listOwnerPullRequests(ctx.db, args.owner);
    rows.sort((a, b) => Number(b.primary) - Number(a.primary));
    return await Promise.all(
      rows.map(async (row) => {
        const repo = await ctx.db.get(row.repoId);
        const match = /github\.com\/([^/]+)\/([^/]+)\/pull\//.exec(row.prUrl);
        return {
          _id: row._id,
          prUrl: row.prUrl,
          prNumber: row.prNumber,
          title: row.title,
          state: row.state,
          primary: row.primary,
          origin: row.origin,
          headBranch: row.headBranch,
          baseBranch: row.baseBranch,
          repoId: row.repoId,
          repoOwner: repo?.owner ?? match?.[1] ?? "",
          repoName: repo?.name ?? match?.[2] ?? "",
          linkedRepo:
            row.owner.kind === "session" &&
            row.owner.sessionRepoId !== undefined,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    );
  },
});

/** Every PR an owner holds, for actions (newest first). */
export const listForOwnerInternal = internalQuery({
  args: { owner: sandboxOwnerValidator },
  returns: v.array(pullRequestValidator),
  handler: async (ctx, args) => await listOwnerPullRequests(ctx.db, args.owner),
});

export const getByUrlInternal = internalQuery({
  args: { prUrl: v.string() },
  returns: v.union(pullRequestValidator, v.null()),
  handler: async (ctx, args) => await findPullRequestByUrl(ctx.db, args.prUrl),
});

/** Action-side entry to `recordPullRequest` (PR creation runs in actions). */
export const record = internalMutation({
  args: {
    owner: prOwnerValidator,
    repoId: v.id("githubRepos"),
    prUrl: v.string(),
    state: prStateValidator,
    primary: v.boolean(),
    origin: prOriginValidator,
    headBranch: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordPullRequest(ctx, args);
    return null;
  },
});

/**
 * Overwrites a row with what GitHub reports now. Bookkeeping only — the owner
 * does not react (no archive, no notification), so a backfill can correct
 * historic rows without replaying their lifecycle.
 */
export const applyGitHubSnapshot = internalMutation({
  args: {
    prUrl: v.string(),
    state: prStateValidator,
    title: v.string(),
    headBranch: v.string(),
    baseBranch: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await findPullRequestByUrl(ctx.db, args.prUrl);
    if (!row) return null;
    await setPullRequestState(ctx, row, {
      state: args.state,
      title: args.title,
      headBranch: args.headBranch,
      baseBranch: args.baseBranch,
    });
    return null;
  },
});

/** Action-side state change for a tracked PR (e.g. Send for Review → open). */
export const setStateByUrl = internalMutation({
  args: { prUrl: v.string(), state: prStateValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await findPullRequestByUrl(ctx.db, args.prUrl);
    if (row) await setPullRequestState(ctx, row, { state: args.state });
    return null;
  },
});
