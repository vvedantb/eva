"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { invalidatePrHeaderCache } from "./pullRequests";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getActionRepoWithAccess } from "../functions";
import { patchPullRequest } from "./pullRequestWrite";
import { fetchLatestDeploymentStatus } from "./deploymentSnapshot";

const MAX_ISSUE_COMMENTS = 100;
const MAX_REVIEW_COMMENTS = 100;
const MAX_CHECKS = 40;
/**
 * Deployments of one commit. A repo with several apps deploys each of them, and
 * each costs a second request for its latest status, so this is a ceiling on
 * fan-out rather than on what is interesting.
 */
const MAX_PREVIEWS = 4;
const MAX_COMMITS = 30;
/** GitHub itself serves at most 250 commits per pull request. */
const MAX_ALL_COMMITS = 250;

/** Overview GitHub payload is moderately volatile (checks/comments). */
const PR_OVERVIEW_CACHE_TTL_MS = 60_000;

const pullRequestCommentValidator = v.object({
  id: v.number(),
  kind: v.union(v.literal("issue"), v.literal("review")),
  body: v.string(),
  authorLogin: v.union(v.string(), v.null()),
  authorAvatarUrl: v.union(v.string(), v.null()),
  createdAt: v.string(),
  htmlUrl: v.string(),
  /** Present for inline review comments. */
  path: v.optional(v.string()),
  line: v.optional(v.union(v.number(), v.null())),
  /**
   * Review this inline comment belongs to, so the timeline can nest it under the
   * matching review verdict. Null for standalone (issue) comments.
   */
  reviewId: v.optional(v.union(v.number(), v.null())),
});

const pullRequestCheckValidator = v.object({
  /**
   * Check runs come from the Checks API; statuses come from the older commit
   * status API. GitHub's own PR page merges both, and review bots split across
   * the two, so keep the origin for grouping/labelling.
   */
  kind: v.union(v.literal("check"), v.literal("status")),
  name: v.string(),
  status: v.string(),
  conclusion: v.union(v.string(), v.null()),
  htmlUrl: v.union(v.string(), v.null()),
  /** Short bot-authored summary line, e.g. "3 issues found". */
  description: v.union(v.string(), v.null()),
});

const pullRequestReviewValidator = v.object({
  id: v.number(),
  authorLogin: v.string(),
  authorAvatarUrl: v.union(v.string(), v.null()),
  /** APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING */
  state: v.string(),
  submittedAt: v.union(v.string(), v.null()),
  htmlUrl: v.string(),
});

/**
 * A submitted review as a timeline event — unlike `reviews` (collapsed to the
 * latest verdict per author for the sidebar), every submitted review is kept, in
 * order, with its body, because the conversation shows each one where it landed.
 */
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
  /** First line only — the rest is body detail the list does not show. */
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

/**
 * A deployment of the head commit — a preview environment, in practice. GitHub
 * models the address as a *status* on a deployment rather than on the deployment
 * itself, so `url` is null until the provider has reported one.
 */
const pullRequestPreviewValidator = v.object({
  /** GitHub's environment name, e.g. "Preview" or "preview-eva". */
  environment: v.string(),
  url: v.union(v.string(), v.null()),
  /** success | pending | in_progress | failure | error | inactive | queued */
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
  /** GitHub's own count, which can exceed the returned `commits` page. */
  commitCount: v.number(),
  commits: v.array(pullRequestCommitValidator),
  commitsTruncated: v.boolean(),
  /** null while GitHub computes mergeability — the client retries. */
  mergeable: v.union(v.boolean(), v.null()),
  /** clean | dirty | blocked | behind | unstable | draft | unknown */
  mergeableState: v.string(),
  mergedAt: v.union(v.string(), v.null()),
  mergedByLogin: v.union(v.string(), v.null()),
  /** The commit the merge produced, so the lifecycle event can link to it. */
  mergeCommitSha: v.union(v.string(), v.null()),
  labels: v.array(pullRequestLabelValidator),
  /** Latest decisive review per reviewer, human or bot. */
  reviews: v.array(pullRequestReviewValidator),
  /** Every submitted review, in order, for the conversation timeline. */
  reviewEvents: v.array(pullRequestReviewEventValidator),
  requestedReviewers: v.array(pullRequestActorValidator),
  assignees: v.array(pullRequestActorValidator),
  checks: v.array(pullRequestCheckValidator),
  checksTruncated: v.boolean(),
  /** Deployments of the head commit, newest first. Empty where nothing deploys. */
  previews: v.array(pullRequestPreviewValidator),
  comments: v.array(pullRequestCommentValidator),
  commentsTruncated: v.boolean(),
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
  /** Derived PR lifecycle for the sidebar meta column. */
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
/** One entry of GitHub's PR commits listing, taken from the client's own types. */
type GithubPrCommit = Awaited<
  ReturnType<InstallationOctokit["rest"]["pulls"]["listCommits"]>
>["data"][number];

/** Shared by the overview's first page and the full listing behind Load more. */
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
    const repoId: Id<"githubRepos"> = args.repoId;
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);

    // Only checks and commit statuses need the head sha, so they chain off the
    // PR fetch while the other four calls start immediately — one round trip
    // instead of two on the uncached path.
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
      // Older bots report through commit statuses rather than check runs.
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
    ]);

    // The address lives on the deployment's latest *status*, not the deployment,
    // so each one costs a second request. Failures are swallowed per deployment:
    // a preview nobody can reach is worth less than the rest of the overview.
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
    // A pending review is an unsubmitted draft, so it never appears on the
    // conversation; the sidebar still collapses over the full history.
    const reviewEvents = allReviews.filter(
      (review) => review.state !== "PENDING",
    );

    // GitHub serves this listing oldest-first, so the page kept here is the start
    // of the branch: the conversation reads from the beginning, and Load more
    // (`getPullRequestCommits`) fetches the newer ones on demand.
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
      // Present on an open pull request too (GitHub's test-merge commit), so it
      // is only meaningful once `merged` is true.
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
    };
  },
});

// V3: payload gained `reviewEvents` and per-comment `reviewId` for the
// conversation timeline — a bumped name drops V2 entries instead of serving
// objects that are missing the new fields.
const prOverviewCache = new ActionCache(components.actionCache, {
  action: internal._github.prOverview.fetchPullRequestOverview,
  name: "prOverviewV3",
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
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
    /** Omitted fields are left as they are on GitHub. */
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    /**
     * Close or reopen. Reopening a *merged* pull request is not a thing GitHub
     * allows, so the caller has to know which state the branch is in — the header
     * only offers Reopen for a closed one.
     */
    state: v.optional(v.union(v.literal("open"), v.literal("closed"))),
  },
  returns: v.object({ title: v.string(), body: v.union(v.string(), v.null()) }),
  handler: async (ctx, args): Promise<{ title: string; body: string | null }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await getActionRepoWithAccess(ctx, args.repoId);

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

    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

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
  /** True when the pull request has more commits than GitHub will serve. */
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
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
      per_page: 100,
    });

    return {
      commits: commits.map(toPullRequestCommit),
      // GitHub's own ceiling: a longer branch simply cannot be listed here, so
      // the timeline keeps its link out rather than promising the whole history.
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await getActionRepoWithAccess(ctx, args.repoId);

    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    const { data } = await octokit.rest.pulls.merge({
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
      merge_method: args.method,
    });

    return {
      merged: data.merged,
      sha: data.sha ?? null,
      message: data.message,
    };
  },
});
