"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { prNumberFromGithubUrl } from "@eva/shared";
import {
  prDiffQuery,
  toPrDiffData,
  type PrDiffData,
} from "@/lib/prReviewQueries";

export type PrDiffState =
  | { status: "loading" }
  | { status: "error" }
  | ({
      status: "ready";
      refreshing: boolean;
    } & PrDiffData);

/**
 * Loads a pull request's diff, already split into per-file entries. `getPrDiff`
 * is a Convex action rather than a reactive query, so it is cached by TanStack
 * Query: a PR seen before in this session — or warmed by hovering the reviews
 * list — paints from cache and revalidates behind the scenes.
 */
export function usePrDiff(
  prUrl: string | undefined,
  repoId: Id<"githubRepos">,
): { state: PrDiffState; refresh: () => void } {
  const getPrDiff = useAction(api.github.getPrDiff);
  const queryClient = useQueryClient();
  const prNumber =
    prUrl === undefined ? undefined : prNumberFromGithubUrl(prUrl);

  const options = prDiffQuery(getPrDiff, repoId, prNumber);
  const query = useQuery(options);

  const refresh = useMutation({
    mutationFn: (number: number) =>
      getPrDiff({ repoId, prNumber: number, force: true }).then(toPrDiffData),
    onSuccess: (data) => queryClient.setQueryData(options.queryKey, data),
  });

  const state = ((): PrDiffState => {
    if (prUrl === undefined) return { status: "loading" };
    if (prNumber === undefined) return { status: "error" };
    if (query.data !== undefined) {
      return {
        status: "ready",
        ...query.data,
        refreshing: query.isFetching || refresh.isPending,
      };
    }
    return query.isError ? { status: "error" } : { status: "loading" };
  })();

  return {
    state,
    refresh: () => {
      if (prNumber !== undefined) refresh.mutate(prNumber);
    },
  };
}
