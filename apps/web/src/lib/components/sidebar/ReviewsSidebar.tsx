"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Button, Spinner, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconGitPullRequest } from "@tabler/icons-react";
import { useQueryState } from "nuqs";
import { prErrorMessage, prefetchPrReview } from "@/lib/prReviewQueries";
import { pullRequestListStateParser } from "@/lib/search-params";
import { ReviewsListStateTabs } from "@/lib/components/sidebar/_components/ReviewsListStateTabs";
import {
  PrRenameDialog,
  type PrToRename,
} from "@/lib/components/sidebar/_components/PrRenameDialog";
import { ReviewsSidebarRow } from "@/lib/components/sidebar/_components/ReviewsSidebarRow";
import { SharedLayoutNav } from "@/lib/components/sidebar/SharedLayoutNav";

interface ReviewsSidebarProps {
  repoId: Id<"githubRepos">;
  basePath: string;
  pathname: string;
  onNavigate?: () => void;
}

/**
 * Context sidebar listing GitHub PRs for the codebase. Selection opens
 * /reviews/$prNumber/overview (and sibling tabs).
 */
export function ReviewsSidebar({
  repoId,
  basePath,
  pathname,
  onNavigate,
}: ReviewsSidebarProps) {
  const listPullRequests = useAction(api.github.listPullRequests);
  // Bound once here so the row only needs a `() => void` — the query module
  // stays free of any dependency on the Convex client.
  const runners = {
    diff: useAction(api.github.getPrDiff),
    overview: useAction(api.github.getPullRequestOverview),
    header: useAction(api.github.getPullRequestHeader),
  };
  const queryClient = useQueryClient();
  // One rename dialog serves the whole list; this is the row it is open for.
  const [renaming, setRenaming] = useState<PrToRename | null>(null);
  const [listState, setListState] = useQueryState(
    "prState",
    pullRequestListStateParser,
  );

  const pullsQuery = useQuery({
    queryKey: ["pr", "list", repoId, listState],
    queryFn: () => listPullRequests({ repoId, state: listState }),
  });

  const activePrNumber = (() => {
    const match = pathname.match(/\/reviews\/(\d+)(?:\/|$)/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  })();

  const pulls = pullsQuery.data ?? [];

  return (
    <>
      <div className="px-2 py-2">
        <ReviewsListStateTabs
          state={listState}
          onChange={(next) => {
            void setListState(next);
          }}
        />
      </div>

      <div className="flex-1">
        <SharedLayoutNav layoutId="reviews-sidebar-nav">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={listState}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              {pullsQuery.isPending ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="sm" />
                </div>
              ) : pullsQuery.data === undefined ? (
                <div className="space-y-2 p-4 text-center">
                  <p className="text-sm text-destructive">
                    {prErrorMessage(
                      pullsQuery.error,
                      "Couldn't load pull requests",
                    )}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pullsQuery.isFetching}
                    onClick={() => void pullsQuery.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : pulls.length === 0 ? (
                <div className="p-4 text-center">
                  <IconGitPullRequest
                    size={28}
                    className="mx-auto mb-2 text-muted-foreground"
                  />
                  <p className="text-sm text-muted-foreground">
                    No {listState === "all" ? "" : `${listState} `}pull requests
                  </p>
                </div>
              ) : (
                <div className="px-2 pb-2">
                  {pulls.map((pr) => (
                    <ReviewsSidebarRow
                      key={pr.number}
                      pr={pr}
                      href={`${basePath}/reviews/${pr.number}/overview`}
                      isActive={activePrNumber === pr.number}
                      onNavigate={onNavigate}
                      onPrefetch={() =>
                        prefetchPrReview(
                          queryClient,
                          runners,
                          repoId,
                          pr.number,
                        )
                      }
                      onRename={() =>
                        setRenaming({ number: pr.number, title: pr.title })
                      }
                    />
                  ))}
                </div>
              )}
            </m.div>
          </AnimatePresence>
        </SharedLayoutNav>
      </div>

      <PrRenameDialog
        repoId={repoId}
        pr={renaming}
        onClose={() => setRenaming(null)}
      />
    </>
  );
}
