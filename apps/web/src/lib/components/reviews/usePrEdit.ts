"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  prErrorMessage,
  prHeaderQuery,
  prOverviewQuery,
} from "@/lib/prReviewQueries";

/**
 * Renames a pull request or rewrites its description — used by the sidebar's
 * rename dialog and by the description bubble's editor.
 *
 * The action drops the server-side caches, so all that is left here is to move
 * the new text into the entries already on screen: the page header, the overview,
 * and the sidebar's list. Patching rather than refetching keeps the edit instant,
 * and because the server caches are gone the next revalidate agrees with it
 * instead of reverting the text.
 */
export function usePrEdit(
  repoId: Id<"githubRepos">,
  prNumber: number,
  onSaved?: () => void,
): {
  save: (fields: { title?: string; body?: string }) => void;
  saving: boolean;
  error: string | null;
} {
  const updatePr = useAction(api.github.updatePullRequest);
  // Built from the same factories the panels read, so the keys cannot drift.
  const getOverview = useAction(api.github.getPullRequestOverview);
  const getHeader = useAction(api.github.getPullRequestHeader);
  const queryClient = useQueryClient();

  const overviewKey = prOverviewQuery(getOverview, repoId, prNumber).queryKey;
  const headerKey = prHeaderQuery(getHeader, repoId, prNumber).queryKey;

  const save = useMutation({
    mutationFn: (fields: { title?: string; body?: string }) =>
      updatePr({ repoId, prNumber, ...fields }),
    onSuccess: ({ title, body }) => {
      queryClient.setQueryData(overviewKey, (prev) =>
        prev === undefined ? prev : { ...prev, title, body },
      );
      queryClient.setQueryData(headerKey, (prev) =>
        prev === undefined ? prev : { ...prev, title },
      );
      // The pull request list is uncached on the server, so refetching it is
      // enough to show the new title in the sidebar.
      void queryClient.invalidateQueries({ queryKey: ["pr", "list", repoId] });
      onSaved?.();
    },
  });

  return {
    save: (fields) => save.mutate(fields),
    saving: save.isPending,
    error: save.isError
      ? prErrorMessage(save.error, "Couldn't save the change")
      : null,
  };
}
