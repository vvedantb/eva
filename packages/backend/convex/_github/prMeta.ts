"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { getActionRepoWithAccess } from "../functions";
import { invalidatePrOverviewCache } from "./prOverview";
import { isSandboxIdentity } from "../_auth/sandboxIdentity";

/**
 * The three fields of a pull request's metadata column a reader can change from
 * eva: who is asked to review, who owns it, and how it is labelled.
 *
 * Each of these is a *set*, so every mutation here takes the whole set and lets
 * GitHub work out the delta. The alternative — add/remove calls per chip — needs
 * the client to diff against a payload that may be a minute stale, and gets it
 * wrong exactly when two people are editing at once.
 *
 * Reviewers and assignees are separate endpoints on separate resources (pulls vs
 * issues) even though they look identical in the column, which is GitHub's
 * inheritance showing through rather than a distinction worth preserving here.
 */

const MAX_CANDIDATES = 100;

const candidateValidator = v.object({
  login: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

const repoLabelValidator = v.object({
  name: v.string(),
  color: v.string(),
  description: v.union(v.string(), v.null()),
});

/**
 * Who may be asked to review or be assigned. GitHub's assignee list is the
 * narrower of the two (it excludes users who can only read), and a reviewer who
 * cannot be assigned is a rarer problem than a list that omits half the team, so
 * collaborators are the source and GitHub rejects the impossible cases.
 */
export const listPullRequestCandidates = action({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({
    users: v.array(candidateValidator),
    labels: v.array(repoLabelValidator),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    users: { login: string; avatarUrl: string | null }[];
    labels: { name: string; color: string; description: string | null }[];
  }> => {
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
    const [collaborators, labels] = await Promise.all([
      octokit.rest.repos
        .listCollaborators({
          owner: repo.owner,
          repo: repo.name,
          per_page: MAX_CANDIDATES,
        })
        .catch(() => ({ data: [] })),
      octokit.rest.issues
        .listLabelsForRepo({
          owner: repo.owner,
          repo: repo.name,
          per_page: MAX_CANDIDATES,
        })
        .catch(() => ({ data: [] })),
    ]);

    return {
      users: collaborators.data.map((user) => ({
        login: user.login,
        avatarUrl: user.avatar_url ?? null,
      })),
      labels: labels.data.map((label) => ({
        name: label.name,
        color: label.color ?? "cccccc",
        description: label.description ?? null,
      })),
    };
  },
});

/**
 * Replaces the requested reviewers with `logins`. GitHub has no "set" call for
 * these, so the removal has to run first — and it has to be skipped when there is
 * nothing to remove, because the endpoint rejects an empty list.
 */
export const setPullRequestReviewers = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    logins: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
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
    const target = { owner: repo.owner, repo: repo.name, pull_number: args.prNumber };

    const current = await octokit.rest.pulls.get(target);
    const existing = (current.data.requested_reviewers ?? []).map(
      (reviewer) => reviewer.login,
    );
    const removed = existing.filter((login) => !args.logins.includes(login));
    const added = args.logins.filter((login) => !existing.includes(login));

    if (removed.length > 0) {
      await octokit.rest.pulls.removeRequestedReviewers({
        ...target,
        reviewers: removed,
      });
    }
    if (added.length > 0) {
      await octokit.rest.pulls.requestReviewers({
        ...target,
        reviewers: added,
      });
    }

    await invalidatePrOverviewCache(ctx, {
      repoId: args.repoId,
      prNumber: args.prNumber,
    });
    return null;
  },
});

/** Replaces the assignees with `logins`. Pull requests are issues, here. */
export const setPullRequestAssignees = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    logins: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
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
    // `issues.update` takes the whole set, unlike the reviewer endpoints.
    await octokit.rest.issues.update({
      owner: repo.owner,
      repo: repo.name,
      issue_number: args.prNumber,
      assignees: args.logins,
    });

    await invalidatePrOverviewCache(ctx, {
      repoId: args.repoId,
      prNumber: args.prNumber,
    });
    return null;
  },
});

/** Replaces the labels with `names`. An empty array clears them. */
export const setPullRequestLabels = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    names: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
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
    await octokit.rest.issues.setLabels({
      owner: repo.owner,
      repo: repo.name,
      issue_number: args.prNumber,
      labels: args.names,
    });

    await invalidatePrOverviewCache(ctx, {
      repoId: args.repoId,
      prNumber: args.prNumber,
    });
    return null;
  },
});
