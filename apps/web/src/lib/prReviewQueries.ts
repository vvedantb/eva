import {
  queryOptions,
  skipToken,
  type QueryClient,
} from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";
import {
  buildDiffFileEntries,
  type DiffFileEntry,
} from "./components/sandbox/diffFiles";

/**
 * Query definitions for the three pull request review payloads.
 *
 * Overview, diff, and header all come from Convex actions, so caching, in-flight
 * deduplication, staleness, and prefetching are TanStack Query's job. Defining
 * each query once here is what lets a hover over the reviews list warm exactly
 * the entries the panels then read — the keys cannot drift apart.
 */

/** Every one of these actions takes the same arguments, so one shape covers all. */
export type PrRunner<T> = (args: {
  repoId: Id<"githubRepos">;
  prNumber: number;
  force?: boolean;
}) => Promise<T>;

type PrDiffPayload = FunctionReturnType<typeof api.github.getPrDiff>;
type PrOverviewPayload = FunctionReturnType<
  typeof api.github.getPullRequestOverview
>;
type PrHeaderPayload = FunctionReturnType<
  typeof api.github.getPullRequestHeader
>;
export type PrCommitsData = FunctionReturnType<
  typeof api.github.getPullRequestCommits
>;

/** Commits are never force-refetched, so this runner has no `force` argument. */
export type PrCommitsRunner = (args: {
  repoId: Id<"githubRepos">;
  prNumber: number;
}) => Promise<PrCommitsData>;

/**
 * A PR diff as the Diffs tab consumes it. The raw diff text is split into
 * per-file entries here, once per fetch, rather than on every render.
 */
export interface PrDiffData {
  readonly entries: readonly DiffFileEntry[];
  readonly truncated: boolean;
  readonly baseSha: string;
  readonly headSha: string;
  readonly repoUrl: string;
}

/** Exported because the forced-refresh path must transform the payload too. */
export function toPrDiffData(payload: PrDiffPayload): PrDiffData {
  return {
    entries: buildDiffFileEntries(payload.diff),
    truncated: payload.truncated,
    baseSha: payload.baseSha,
    headSha: payload.headSha,
    repoUrl: payload.repoUrl,
  };
}

/**
 * A pull request number is undefined while a URL is still being resolved, or
 * when it cannot be parsed at all. `skipToken` keeps the query idle in that case
 * without the caller having to invent a placeholder number for the key.
 */
export function prDiffQuery(
  run: PrRunner<PrDiffPayload>,
  repoId: Id<"githubRepos">,
  prNumber: number | undefined,
) {
  return queryOptions({
    queryKey: ["pr", "diff", repoId, prNumber] as const,
    queryFn:
      prNumber === undefined
        ? skipToken
        : () => run({ repoId, prNumber }).then(toPrDiffData),
  });
}

export function prOverviewQuery(
  run: PrRunner<PrOverviewPayload>,
  repoId: Id<"githubRepos">,
  prNumber: number | undefined,
) {
  return queryOptions({
    queryKey: ["pr", "overview", repoId, prNumber] as const,
    queryFn:
      prNumber === undefined ? skipToken : () => run({ repoId, prNumber }),
  });
}

export function prHeaderQuery(
  run: PrRunner<PrHeaderPayload>,
  repoId: Id<"githubRepos">,
  prNumber: number | undefined,
) {
  return queryOptions({
    queryKey: ["pr", "header", repoId, prNumber] as const,
    queryFn:
      prNumber === undefined ? skipToken : () => run({ repoId, prNumber }),
  });
}

/**
 * Every commit on a pull request, as opposed to the first page the overview
 * carries. Deliberately not part of `prefetchPrReview`: a long branch would cost
 * up to 250 commits on a hover, and most readers never ask for them. The
 * timeline reads this entry with fetching disabled and fills it on Load more.
 */
export function prCommitsQuery(
  run: PrCommitsRunner,
  repoId: Id<"githubRepos">,
  prNumber: number,
) {
  return queryOptions({
    queryKey: ["pr", "commits", repoId, prNumber] as const,
    queryFn: () => run({ repoId, prNumber }),
  });
}

type CommitDiffPayload = FunctionReturnType<typeof api.github.getCommitDiff>;

/** Commits are addressed by sha, so this runner takes no pull request number. */
export type CommitDiffRunner = (args: {
  repoId: Id<"githubRepos">;
  sha: string;
}) => Promise<CommitDiffPayload>;

/** One commit's diff, split into per-file entries the same way a PR diff is. */
export interface CommitDiffData {
  readonly entries: readonly DiffFileEntry[];
  readonly truncated: boolean;
  readonly message: string;
  readonly additions: number;
  readonly deletions: number;
  readonly changedFiles: number;
}

/**
 * The diff of a single commit, opened from a commit row in the timeline. A commit
 * is immutable, so the entry never goes stale: reopening the dialog repaints from
 * the cache without touching GitHub again.
 */
export function commitDiffQuery(
  run: CommitDiffRunner,
  repoId: Id<"githubRepos">,
  sha: string,
) {
  return queryOptions({
    queryKey: ["commit", "diff", repoId, sha] as const,
    queryFn: (): Promise<CommitDiffData> =>
      run({ repoId, sha }).then((payload) => ({
        entries: buildDiffFileEntries(payload.diff),
        truncated: payload.truncated,
        message: payload.message,
        additions: payload.additions,
        deletions: payload.deletions,
        changedFiles: payload.changedFiles,
      })),
    staleTime: Infinity,
  });
}

type CompareDiffPayload = FunctionReturnType<typeof api.github.getCompareDiff>;

export type CompareDiffRunner = (args: {
  repoId: Id<"githubRepos">;
  baseSha: string;
  headSha: string;
}) => Promise<CompareDiffPayload>;

/** `base...head`, split per file; `unavailable` when GitHub has not seen a sha. */
export interface CompareDiffData {
  readonly entries: readonly DiffFileEntry[];
  readonly truncated: boolean;
  readonly unavailable: boolean;
}

/**
 * What a turn changed: the diff between the checkpoints stamped on an assistant
 * message. Shas are immutable, so this is cached forever like a commit diff.
 */
export function compareDiffQuery(
  run: CompareDiffRunner,
  repoId: Id<"githubRepos">,
  baseSha: string,
  headSha: string,
) {
  return queryOptions({
    queryKey: ["compare", "diff", repoId, baseSha, headSha] as const,
    queryFn: (): Promise<CompareDiffData> =>
      run({ repoId, baseSha, headSha }).then((payload) => ({
        entries: buildDiffFileEntries(payload.diff),
        truncated: payload.truncated,
        unavailable: payload.unavailable,
      })),
    staleTime: Infinity,
  });
}

/**
 * GitHub's own message where there is one, the caller's wording where there is
 * not — a rejected query can carry an empty message.
 */
export function prErrorMessage(error: Error | null, fallback: string): string {
  if (error === null || error.message.length === 0) return fallback;
  return error.message;
}

export interface PrReviewRunners {
  readonly diff: PrRunner<PrDiffPayload>;
  readonly overview: PrRunner<PrOverviewPayload>;
  readonly header: PrRunner<PrHeaderPayload>;
}

/**
 * Warms all three payloads for a pull request — called on hover intent in the
 * reviews list so the click itself has nothing left to fetch. `prefetchQuery`
 * already no-ops on fresh data, joins a request that is in flight, and swallows
 * failures, so repeated hovers over one row cost nothing.
 */
export function prefetchPrReview(
  client: QueryClient,
  runners: PrReviewRunners,
  repoId: Id<"githubRepos">,
  prNumber: number,
): void {
  void client.prefetchQuery(prDiffQuery(runners.diff, repoId, prNumber));
  void client.prefetchQuery(
    prOverviewQuery(runners.overview, repoId, prNumber),
  );
  void client.prefetchQuery(prHeaderQuery(runners.header, repoId, prNumber));
}
