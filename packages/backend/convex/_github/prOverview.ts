"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { getInstallationOctokit, getRepoOctokit } from "../githubAuth";
import { invalidatePrHeaderCache } from "./pullRequests";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getActionRepoWithAccess } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";
import { patchPullRequest } from "./pullRequestWrite";
import { fetchLatestDeploymentStatus } from "./deploymentSnapshot";
import {
  fetchPullRequestStack,
  mergeStackAsync,
  pullRequestStackValidator,
  type PullRequestStack,
} from "./prStack";

const MAX_ISSUE_COMMENTS = 100;
const MAX_REVIEW_COMMENTS = 100;
const MAX_CHECKS = 40;
const MAX_PREVIEWS = 4;
const MAX_COMMITS = 30;
const MAX_ALL_COMMITS = 250;

const PR_OVERVIEW_CACHE_TTL_MS = 60_000;

const pullRequestCommentValidator = v.object({
  id: v.number(),
  kind: v.union(v.literal("issue"), v.literal("review")),
  body: v.string(),
  authorLogin: v.union(v.string(), v.null()),
  authorAvatarUrl: v.union(v.string(), v.null()),
  createdAt: v.string(),
  htmlUrl: v.string(),
  path: v.optional(v.string()),
  line: v.optional(v.union(v.number(), v.null())),
  reviewId: v.optional(v.union(v.number(), v.null())),
});

const pullRequestCheckValidator = v.object({
  kind: v.union(v.literal("check"), v.literal("status")),
  name: v.string(),
  status: v.string(),
  conclusion: v.union(v.string(), v.null()),
  htmlUrl: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
});

const pullRequestReviewValidator = v.object({
  id: v.number(),
  authorLogin: v.string(),
  authorAvatarUrl: v.union(v.string(), v.null()),
  state: v.string(),
  submittedAt: v.union(v.string(), v.null()),
  htmlUrl: v.string(),
});

const pullRequestReviewEventValidator = v.object({
  id: v.number(),
  authorLogin: v.string(),
  authorAvatarUrl: v.union(v.string(), v.null()),
  state: v.string(),
  submittedAt: v.union(v.string(), v.null()),
  htmlUrl: v.string(),
  body: v.string(),
});

const pullRequestActorValidator = v.object({
  login: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

const pullRequestCommitValidator = v.object({
  sha: v.string(),
  message: v.string(),
  authorLogin: v.union(v.string(), v.null()),
  authorAvatarUrl: v.union(v.string(), v.null()),
  committedAt: v.union(v.string(), v.null()),
  htmlUrl: v.string(),
});

const pullRequestLabelValidator = v.object({
  name: v.string(),
  color: v.string(),
});

const pullRequestPreviewValidator = v.object({
  environment: v.string(),
  url: v.union(v.string(), v.null()),
  state: v.string(),
  updatedAt: v.string(),
});

const pullRequestOverviewValidator = v.object({
  number: v.number(),
  title: v.string(),
  status: v.union(v.literal("open"), v.literal("closed"), v.literal("merged")),
  draft: v.boolean(),
  body: v.union(v.string(), v.null()),
  authorLogin: v.union(v.string(), v.null()),
  authorAvatarUrl: v.union(v.string(), v.null()),
  htmlUrl: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  headRef: v.string(),
  baseRef: v.string(),
  headSha: v.string(),
  changedFiles: v.number(),
  additions: v.number(),
  deletions: v.number(),
  commitCount: v.number(),
  commits: v.array(pullRequestCommitValidator),
  commitsTruncated: v.boolean(),
  mergeable: v.union(v.boolean(), v.null()),
  mergeableState: v.string(),
  mergedAt: v.union(v.string(), v.null()),
  mergedByLogin: v.union(v.string(), v.null()),
  mergeCommitSha: v.union(v.string(), v.null()),
  labels: v.array(pullRequestLabelValidator),
  reviews: v.array(pullRequestReviewValidator),
  reviewEvents: v.array(pullRequestReviewEventValidator),
  requestedReviewers: v.array(pullRequestActorValidator),
  assignees: v.array(pullRequestActorValidator),
  checks: v.array(pullRequestCheckValidator),
  checksTruncated: v.boolean(),
  previews: v.array(pullRequestPreviewValidator),
  comments: v.array(pullRequestCommentValidator),
  commentsTruncated: v.boolean(),
  stack: v.union(pullRequestStackValidator, v.null()),
});

type PullRequestComment = {
  id: number;
  kind: "issue" | "review";
  body: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  htmlUrl: string;
  path?: string;
  line?: number | null;
  reviewId?: number | null;
};

type PullRequestCheck = {
  kind: "check" | "status";
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string | null;
  description: string | null;
};

type PullRequestReview = {
  id: number;
  authorLogin: string;
  authorAvatarUrl: string | null;
  state: string;
  submittedAt: string | null;
  htmlUrl: string;
};

type PullRequestReviewEvent = PullRequestReview & { body: string };

type PullRequestActor = {
  login: string;
  avatarUrl: string | null;
};

type PullRequestCommit = {
  sha: string;
  message: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  htmlUrl: string;
};

type PullRequestLabel = {
  name: string;
  color: string;
};

type PullRequestPreview = {
  environment: string;
  url: string | null;
  state: string;
  updatedAt: string;
};

type PullRequestOverview = {
  number: number;
  title: string;
  status: "open" | "closed" | "merged";
  draft: boolean;
  body: string | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  commitCount: number;
  commits: PullRequestCommit[];
  commitsTruncated: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  mergedAt: string | null;
  mergedByLogin: string | null;
  mergeCommitSha: string | null;
  labels: PullRequestLabel[];
  reviews: PullRequestReview[];
  reviewEvents: PullRequestReviewEvent[];
  requestedReviewers: PullRequestActor[];
  assignees: PullRequestActor[];
  checks: PullRequestCheck[];
  checksTruncated: boolean;
  previews: PullRequestPreview[];
  comments: PullRequestComment[];
  commentsTruncated: boolean;
  stack: PullRequestStack | null;
};

function derivePrStatus(
  state: string,
  merged: boolean | null | undefined,
): "open" | "closed" | "merged" {
  if (merged === true) return "merged";
  return state === "open" ? "open" : "closed";
}

/**
 * Collapse a review history into what GitHub shows: one row per reviewer. A
 * later "commented" review does not clear an earlier approval or change
 * request, so decisive states win and only then does recency decide.
 *
 * Takes review *events* (which carry `body` for the conversation timeline) but
 * returns the sidebar shape, which does not — reviews are built as fresh
 * objects here rather than reused, so a stray `body` field never reaches the
 * `pullRequestReviewValidator` return validator.
 */
export function latestReviewPerAuthor(
  reviews: PullRequestReviewEvent[],
): PullRequestReview[] {
  const decisive = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
  const byAuthor = new Map<string, PullRequestReviewEvent>();
  for (const review of reviews) {
    const current = byAuthor.get(review.authorLogin);
    if (!current) {
      byAuthor.set(review.authorLogin, review);
      continue;
    }
    const currentIsDecisive = decisive.has(current.state);
    const nextIsDecisive = decisive.has(review.state);
    if (currentIsDecisive && !nextIsDecisive) continue;
    byAuthor.set(review.authorLogin, review);
  }
  return [...byAuthor.values()].map(
    ({ id, authorLogin, authorAvatarUrl, state, submittedAt, htmlUrl }) => ({
      id,
      authorLogin,
      authorAvatarUrl,
      state,
      submittedAt,
      htmlUrl,
    }),
  );
}

type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;
type GithubPrCommit = Awaited<
  ReturnType<InstallationOctokit["rest"]["pulls"]["listCommits"]>
>["data"][number];

function toPullRequestCommit(commit: GithubPrCommit): PullRequestCommit {
  return {
    sha: commit.sha,
    message: commit.commit.message.split("\n")[0] ?? "",
    authorLogin: commit.author?.login ?? commit.commit.author?.name ?? null,
    authorAvatarUrl: commit.author?.avatar_url ?? null,
    committedAt: commit.commit.author?.date ?? null,
    htmlUrl: commit.html_url,
  };
}

/**
 * Uncached GitHub Overview fetch — wrapped by ActionCache. Auth is enforced by
 * the public `getPullRequestOverview` wrapper before `fetch`.
 */
export const fetchPullRequestOverview = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
  },
  returns: pullRequestOverviewValidator,
  handler: async (ctx, args): Promise<PullRequestOverview> => {
    const { repo, octokit } = await getRepoOctokit(ctx, args.repoId);

    const prPromise = octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
    });

    const [
      pr,
      issueRes,
      reviewCommentRes,
      reviewRes,
      commitRes,
      checksRes,
      statusRes,
      deploymentRes,
      stack,
    ] = await Promise.all([
      prPromise.then((res) => res.data),
      octokit.rest.issues.listComments({
        owner: repo.owner,
        repo: repo.name,
        issue_number: args.prNumber,
        per_page: MAX_ISSUE_COMMENTS,
      }),
      octokit.rest.pulls.listReviewComments({
        owner: repo.owner,
        repo: repo.name,
        pull_number: args.prNumber,
        per_page: MAX_REVIEW_COMMENTS,
      }),
      octokit.rest.pulls
        .listReviews({
          owner: repo.owner,
          repo: repo.name,
          pull_number: args.prNumber,
          per_page: 100,
        })
        .catch(() => ({ data: [] })),
      octokit.rest.pulls
        .listCommits({
          owner: repo.owner,
          repo: repo.name,
          pull_number: args.prNumber,
          per_page: MAX_COMMITS,
        })
        .catch(() => ({ data: [] })),
      prPromise
        .then((res) =>
          octokit.rest.checks.listForRef({
            owner: repo.owner,
            repo: repo.name,
            ref: res.data.head.sha,
            per_page: MAX_CHECKS,
          }),
        )
        .catch(() => ({ data: { check_runs: [], total_count: 0 } })),
      prPromise
        .then((res) =>
          octokit.rest.repos.getCombinedStatusForRef({
            owner: repo.owner,
            repo: repo.name,
            ref: res.data.head.sha,
          }),
        )
        .catch(() => ({ data: { statuses: [] } })),
      prPromise
        .then((res) =>
          octokit.rest.repos.listDeployments({
            owner: repo.owner,
            repo: repo.name,
            sha: res.data.head.sha,
            per_page: MAX_PREVIEWS,
          }),
        )
        .catch(() => ({ data: [] })),
      fetchPullRequestStack(octokit, {
        owner: repo.owner,
        repo: repo.name,
        pull_number: args.prNumber,
      }),
    ]);

    const previews: PullRequestPreview[] = (
      await Promise.all(
        deploymentRes.data.slice(0, MAX_PREVIEWS).map(async (deployment) => {
          const latest = await fetchLatestDeploymentStatus({
            repos: octokit.rest.repos,
            owner: repo.owner,
            repo: repo.name,
            deploymentId: deployment.id,
          }).catch(() => null);
          return {
            environment: deployment.environment,
            url: latest?.environment_url ?? null,
            state: latest?.state ?? "queued",
            updatedAt: latest?.created_at ?? deployment.updated_at,
          };
        }),
      )
    ).filter((preview) => preview.state !== "inactive");

    const checkRuns: PullRequestCheck[] = checksRes.data.check_runs
      .slice(0, MAX_CHECKS)
      .map((run) => ({
        kind: "check",
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        description: run.output?.title ?? null,
      }));

    const statusChecks: PullRequestCheck[] = statusRes.data.statuses.map(
      (status) => ({
        kind: "status",
        name: status.context,
        status: status.state === "pending" ? "in_progress" : "completed",
        conclusion:
          status.state === "pending"
            ? null
            : status.state === "success"
              ? "success"
              : "failure",
        htmlUrl: status.target_url ?? null,
        description: status.description ?? null,
      }),
    );

    const allReviews = reviewRes.data.flatMap(
      (review): PullRequestReviewEvent[] =>
        review.user
          ? [
              {
                id: review.id,
                authorLogin: review.user.login,
                authorAvatarUrl: review.user.avatar_url ?? null,
                state: review.state,
                submittedAt: review.submitted_at ?? null,
                htmlUrl: review.html_url,
                body: review.body ?? "",
              },
            ]
          : [],
    );
    const reviews = latestReviewPerAuthor(allReviews);
    const reviewEvents = allReviews.filter(
      (review) => review.state !== "PENDING",
    );

    const commits: PullRequestCommit[] = commitRes.data.map(toPullRequestCommit);

    const comments: PullRequestComment[] = [
      ...issueRes.data.map(
        (c): PullRequestComment => ({
          id: c.id,
          kind: "issue",
          body: c.body ?? "",
          authorLogin: c.user?.login ?? null,
          authorAvatarUrl: c.user?.avatar_url ?? null,
          createdAt: c.created_at,
          htmlUrl: c.html_url,
        }),
      ),
      ...reviewCommentRes.data.map(
        (c): PullRequestComment => ({
          id: c.id,
          kind: "review",
          body: c.body ?? "",
          authorLogin: c.user?.login ?? null,
          authorAvatarUrl: c.user?.avatar_url ?? null,
          createdAt: c.created_at,
          htmlUrl: c.html_url,
          path: c.path,
          line: c.line ?? c.original_line ?? null,
          reviewId: c.pull_request_review_id ?? null,
        }),
      ),
    ].toSorted(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return {
      number: pr.number,
      title: pr.title,
      status: derivePrStatus(pr.state, pr.merged),
      draft: pr.draft === true,
      body: pr.body ?? null,
      authorLogin: pr.user?.login ?? null,
      authorAvatarUrl: pr.user?.avatar_url ?? null,
      htmlUrl: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      headSha: pr.head.sha,
      changedFiles: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      commitCount: pr.commits,
      commits,
      commitsTruncated: pr.commits > commits.length,
      mergeable: pr.mergeable ?? null,
      mergeableState: pr.mergeable_state ?? "unknown",
      mergedAt: pr.merged_at ?? null,
      mergedByLogin: pr.merged_by?.login ?? null,
      mergeCommitSha: pr.merged ? (pr.merge_commit_sha ?? null) : null,
      labels: pr.labels.map((label) => ({
        name: label.name,
        color: label.color,
      })),
      reviews,
      reviewEvents,
      requestedReviewers: (pr.requested_reviewers ?? []).map((reviewer) => ({
        login: reviewer.login,
        avatarUrl: reviewer.avatar_url ?? null,
      })),
      assignees: (pr.assignees ?? []).map((assignee) => ({
        login: assignee.login,
        avatarUrl: assignee.avatar_url ?? null,
      })),
      checks: [...checkRuns, ...statusChecks],
      checksTruncated: checksRes.data.total_count > MAX_CHECKS,
      previews,
      comments,
      commentsTruncated:
        issueRes.data.length >= MAX_ISSUE_COMMENTS ||
        reviewCommentRes.data.length >= MAX_REVIEW_COMMENTS,
      stack,
    };
  },
});

const prOverviewCache = new ActionCache(components.actionCache, {
  action: internal._github.prOverview.fetchPullRequestOverview,
  name: "prOverviewV4",
  ttl: PR_OVERVIEW_CACHE_TTL_MS,
});

/**
 * Everything the Reviews Overview tab shows: description, conversation,
 * checks and commit statuses, reviews, commits, and mergeability. Soft-capped
 * to keep action payloads bounded. ActionCache-backed (60s TTL); pass `force`
 * to bypass (Retry, and after a merge).
 */
export const getPullRequestOverview = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    force: v.optional(v.boolean()),
  },
  returns: pullRequestOverviewValidator,
  handler: async (ctx, args): Promise<PullRequestOverview> => {
    await getActionRepoWithAccess(ctx, args.repoId);

    return await prOverviewCache.fetch(
      ctx,
      { repoId: args.repoId, prNumber: args.prNumber },
      { force: args.force === true },
    );
  },
});

/**
 * Renames a pull request, rewrites its description, or closes/reopens it. Both
 * cached payloads that
 * carry those fields are dropped afterwards — without that, the overview and the
 * page header would keep serving the old text for up to their TTL and the edit
 * would look as though it had been undone.
 */
export const updatePullRequest = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    state: v.optional(v.union(v.literal("open"), v.literal("closed"))),
  },
  returns: v.object({ title: v.string(), body: v.union(v.string(), v.null()) }),
  handler: async (ctx, args): Promise<{ title: string; body: string | null }> => {
    const repo = await getActionRepoWithAccess(ctx, args.repoId);

    const title = args.title?.trim();
    if (title !== undefined && title.length === 0) {
      throw new Error("Title cannot be empty");
    }
    if (
      title === undefined &&
      args.body === undefined &&
      args.state === undefined
    ) {
      throw new Error("Nothing to update");
    }

    const octokit = await getInstallationOctokit(repo.installationId);
    const data = await patchPullRequest(
      octokit,
      {
        owner: repo.owner,
        repo: repo.name,
        pull_number: args.prNumber,
      },
      {
        ...(title === undefined ? {} : { title }),
        ...(args.body === undefined ? {} : { body: args.body }),
        ...(args.state === undefined ? {} : { state: args.state }),
      },
    );

    await invalidatePrOverviewCache(ctx, {
      repoId: args.repoId,
      prNumber: args.prNumber,
    });

    return { title: data.title, body: data.body };
  },
});

/**
 * Drops both cached payloads that describe a pull request. Anything that changes
 * it on GitHub has to call this: without it the overview and the page header keep
 * serving the old text for up to their TTL, and the edit looks as though it had
 * been undone.
 */
export async function invalidatePrOverviewCache(
  ctx: ActionCtx,
  key: { repoId: Id<"githubRepos">; prNumber: number },
): Promise<void> {
  await Promise.all([
    prOverviewCache.remove(ctx, key),
    invalidatePrHeaderCache(ctx, key),
  ]);
}

const pullRequestCommitsValidator = v.object({
  commits: v.array(pullRequestCommitValidator),
  truncated: v.boolean(),
});

type PullRequestCommits = {
  commits: PullRequestCommit[];
  truncated: boolean;
};

/**
 * Uncached full commit listing — wrapped by ActionCache. Auth is enforced by the
 * public `getPullRequestCommits` wrapper before `fetch`.
 */
export const fetchPullRequestCommits = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
  },
  returns: pullRequestCommitsValidator,
  handler: async (ctx, args): Promise<PullRequestCommits> => {
    const { repo, octokit } = await getRepoOctokit(ctx, args.repoId);
    const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
      per_page: 100,
    });

    return {
      commits: commits.map(toPullRequestCommit),
      truncated: commits.length >= MAX_ALL_COMMITS,
    };
  },
});

const prCommitsCache = new ActionCache(components.actionCache, {
  action: internal._github.prOverview.fetchPullRequestCommits,
  name: "prCommitsV1",
  ttl: PR_OVERVIEW_CACHE_TTL_MS,
});

/**
 * Every commit on a pull request, for the timeline's Load more: the overview
 * carries only the first page, and a long branch hides its most recent work
 * behind it. Separate from the overview so the common case still pays for one
 * page instead of up to 250 commits.
 */
export const getPullRequestCommits = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
  },
  returns: pullRequestCommitsValidator,
  handler: async (ctx, args): Promise<PullRequestCommits> => {
    await getActionRepoWithAccess(ctx, args.repoId);

    return await prCommitsCache.fetch(ctx, {
      repoId: args.repoId,
      prNumber: args.prNumber,
    });
  },
});

/**
 * Merges a pull request from the Overview tab. GitHub rejects the call when the
 * PR is not mergeable, so the thrown message is surfaced to the user as-is
 * rather than being second-guessed here.
 *
 * A stacked PR goes through GitHub's asynchronous stack merge, which lands it
 * with every open entry below it. The stack is re-read here rather than taken
 * from the client, so a stale overview cannot decide what gets merged.
 */
export const mergePullRequest = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
    method: v.union(
      v.literal("merge"),
      v.literal("squash"),
      v.literal("rebase"),
    ),
  },
  returns: v.object({
    merged: v.boolean(),
    sha: v.union(v.string(), v.null()),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ merged: boolean; sha: string | null; message: string }> => {
    await rejectSandboxCaller(ctx);
    const repo = await getActionRepoWithAccess(ctx, args.repoId);

    const octokit = await getInstallationOctokit(repo.installationId);
    const target = {
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
    };

    const stack = await fetchPullRequestStack(octokit, target);
    if (stack !== null) {
      const outcome = await mergeStackAsync(octokit, target, args.method);
      if (outcome !== null) {
        await Promise.all(
          stack.entries
            .filter((entry) => entry.position <= stack.position)
            .map((entry) =>
              invalidatePrOverviewCache(ctx, {
                repoId: args.repoId,
                prNumber: entry.number,
              }),
            ),
        );
        const count = stack.entries.filter(
          (entry) =>
            entry.position <= stack.position && entry.status === "open",
        ).length;
        const noun = count === 1 ? "pull request" : `${count} pull requests`;
        return {
          merged: outcome === "merged",
          sha: null,
          message:
            outcome === "merged"
              ? `Merged ${noun}`
              : `Added ${noun} to the merge queue`,
        };
      }
    }

    const { data } = await octokit.rest.pulls.merge({
      ...target,
      merge_method: args.method,
    });

    return {
      merged: data.merged,
      sha: data.sha ?? null,
      message: data.message,
    };
  },
});
