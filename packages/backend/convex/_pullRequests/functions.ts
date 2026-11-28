import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  authMutation,
  authQuery,
  hasRepoAccess,
  hasTaskAccess,
} from "../functions";
import { prOwnerRefValidator } from "../_validators/tableFields";
import {
  prOriginValidator,
  prOwnerValidator,
  prStateValidator,
  pullRequestFields,
} from "../validators";
import {
  findPullRequestByUrl,
  listOwnerPullRequests,
  listTaskLinkedPullRequests,
  recordPullRequest,
  ownerRef,
  setPullRequestState,
  setPullRequestWatch,
  taskRelatedPrLinks,
  type PrOwnerRef,
} from "./store";
import { siblingPrValidator } from "../prBody";

const pullRequestValidator = v.object({
  _id: v.id("pullRequests"),
  _creationTime: v.number(),
  ...pullRequestFields,
});

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
  linkedRepo: v.boolean(),
  watching: v.boolean(),
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
 * newest first. A multi-repo task's linked repos' PRs are its PRs too.
 * Stored data only — no GitHub calls — so the tab is one
 * subscription however many PRs the owner holds.
 */
export const listForOwner = authQuery({
  args: { owner: prOwnerRefValidator },
  returns: v.array(pullRequestListItemValidator),
  handler: async (ctx, args) => {
    if (!(await canReadOwner(ctx.db, args.owner, ctx.userId))) return [];
    const own = await listOwnerPullRequests(ctx.db, args.owner);
    const linked =
      args.owner.kind === "task"
        ? await listTaskLinkedPullRequests(ctx.db, args.owner.taskId)
        : [];
    const readable = await Promise.all(
      linked.map((row) => hasRepoAccess(ctx.db, row.repoId, ctx.userId)),
    );
    const rows = [...own, ...linked.filter((_, index) => readable[index])];
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
          watching: row.watch !== undefined,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    );
  },
});

/** Stops the agent's watch on a PR (the eye button on its row). */
export const stopWatch = authMutation({
  args: { pullRequestId: v.id("pullRequests") },
  returns: v.null(),
  handler: async (ctx, { pullRequestId }) => {
    const row = await ctx.db.get(pullRequestId);
    if (!row || row.watch === undefined) return null;
    if (!(await canReadOwner(ctx.db, ownerRef(row.owner), ctx.userId))) {
      throw new Error("Not authorized");
    }
    await setPullRequestWatch(ctx, row._id, undefined);
    return null;
  },
});

/** Every PR an owner holds, for actions (newest first). */
export const listForOwnerInternal = internalQuery({
  args: { owner: prOwnerRefValidator },
  returns: v.array(pullRequestValidator),
  handler: async (ctx, args) => await listOwnerPullRequests(ctx.db, args.owner),
});

/** A multi-repo task's "Related pull requests" links (`taskRelatedPrLinks`). */
export const taskRelatedPrLinksInternal = internalQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(siblingPrValidator),
  handler: async (ctx, args) => await taskRelatedPrLinks(ctx.db, args.taskId),
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
