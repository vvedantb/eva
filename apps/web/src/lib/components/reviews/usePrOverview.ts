"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  prCommitsQuery,
  prErrorMessage,
  prHeaderQuery,
  prOverviewQuery,
  type PrCommitsData,
} from "@/lib/prReviewQueries";
import type { PrOverview } from "./_components/prOverviewMeta";
import { catchMutationError } from "@/lib/utils/mutationToast";

export type PrOverviewState =
  // No pull request to load — the work being reviewed has not opened one yet.
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  // `refreshing` keeps the panel on screen during a refetch instead of
  // collapsing back to a spinner.
  | { status: "ready"; overview: PrOverview; refreshing: boolean };

/**
 * Loads the Overview payload through TanStack Query, so a PR opened before in
 * this session (or warmed by hovering the reviews list) paints immediately and
 * revalidates behind the scenes. `reload` refetches with both the client cache
 * and the server ActionCache bypassed.
 *
 * Read once per review surface, above the tabs, because the header and the
 * Overview tab are two views of this one payload; the query key is shared, so
 * even a second reader would cost no extra request.
 */
export function usePrOverview(
  repoId: Id<"githubRepos">,
  prNumber: number | undefined,
): { state: PrOverviewState; reload: () => void } {
  const getOverview = useAction(api.github.getPullRequestOverview);
  const queryClient = useQueryClient();

  const options = prOverviewQuery(getOverview, repoId, prNumber);
  const query = useQuery(options);

  // Forced because the point of Reload is to get past the server-side
  // ActionCache as well; the result lands in the same cache entry.
  const reload = useMutation({
    mutationFn: () =>
      prNumber === undefined
        ? Promise.resolve(undefined)
        : catchMutationError(
            getOverview({ repoId, prNumber, force: true }),
            "Couldn't reload pull request",
            "pr-overview-reload",
          ),
    onSuccess: (overview) => {
      if (overview !== undefined) {
        queryClient.setQueryData(options.queryKey, overview);
      }
    },
  });

  const state = ((): PrOverviewState => {
    if (prNumber === undefined) return { status: "idle" };
    if (query.data !== undefined) {
      return {
        status: "ready",
        overview: query.data,
        refreshing: query.isFetching || reload.isPending,
      };
    }
    // A failed revalidate keeps the overview already on screen, so only a cold
    // miss reaches this branch as an error.
    if (query.isError) {
      return {
        status: "error",
        message: prErrorMessage(query.error, "Couldn't load pull request"),
      };
    }
    return { status: "loading" };
  })();

  return { state, reload: () => reload.mutate() };
}

/**
 * The commits the overview does not carry. GitHub serves its commit listing
 * oldest-first, so a branch longer than one page hides its most recent commits —
 * the timeline offers Load more, and this is what that click runs.
 *
 * Read with `enabled: false`, so mounting the timeline never pulls up to 250
 * commits on its own; the click goes through `fetchQuery`, which fills the same
 * cache entry (and no-ops while it is still fresh), so the reader keeps the
 * expanded timeline when they come back to this pull request.
 */
export function usePrCommits(
  repoId: Id<"githubRepos">,
  prNumber: number,
): {
  commits: PrCommitsData["commits"] | undefined;
  /** True when even the full listing hit GitHub's own 250-commit ceiling. */
  truncated: boolean;
  load: () => void;
  loading: boolean;
  error: string | null;
} {
  const getCommits = useAction(api.github.getPullRequestCommits);
  const queryClient = useQueryClient();

  const options = prCommitsQuery(getCommits, repoId, prNumber);
  const cached = useQuery({ ...options, enabled: false });
  const load = useMutation({
    mutationFn: () => queryClient.fetchQuery(options),
  });

  return {
    commits: cached.data?.commits,
    truncated: cached.data?.truncated === true,
    load: () => load.mutate(),
    loading: load.isPending,
    error: load.isError
      ? prErrorMessage(load.error, "Couldn't load commits")
      : null,
  };
}

/**
 * Refresh for a surface that owns chrome above the tabs: the standalone Reviews
 * page shows one Refresh control, and that control has to renew both payloads
 * visible there — the title block and the Overview tab. Forced, so the server
 * ActionCache is bypassed as well, and written straight into the same query
 * entries the panels read, so nothing refetches afterwards.
 */
export function usePrRefresh(
  repoId: Id<"githubRepos">,
  prNumber: number,
): { refresh: () => void; refreshing: boolean } {
  const getOverview = useAction(api.github.getPullRequestOverview);
  const getHeader = useAction(api.github.getPullRequestHeader);
  const queryClient = useQueryClient();

  const overviewOptions = prOverviewQuery(getOverview, repoId, prNumber);
  const headerOptions = prHeaderQuery(getHeader, repoId, prNumber);

  const refresh = useMutation({
    mutationFn: () =>
      catchMutationError(
        Promise.all([
          getOverview({ repoId, prNumber, force: true }),
          getHeader({ repoId, prNumber, force: true }),
        ]),
        "Couldn't refresh pull request",
        "pr-refresh",
      ),
    onSuccess: ([overview, header]) => {
      queryClient.setQueryData(overviewOptions.queryKey, overview);
      queryClient.setQueryData(headerOptions.queryKey, header);
    },
  });

  return { refresh: () => refresh.mutate(), refreshing: refresh.isPending };
}
