"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { Spinner } from "@eva/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PendingReviewCommentsProvider } from "@/lib/contexts/PendingReviewCommentsContext";
import { githubPrUrl } from "@/lib/githubPr";
import { prErrorMessage, prHeaderQuery } from "@/lib/prReviewQueries";
import { REVIEW_DEFAULT_TAB, isReviewTab } from "@/lib/search-params";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { ReviewTabsPanel } from "./ReviewTabsPanel";
import { PrBreadcrumb } from "./_components/PrBreadcrumb";
import { usePrRefresh } from "./usePrOverview";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { useEntityDocumentTitle } from "@/lib/hooks/useDocumentTitle";

/**
 * Standalone Reviews page for one pull request. Owns the PR title block and the
 * `$reviewTab` path param; the tabs come from `ReviewTabsPanel`, shared with the
 * sandbox Review tab.
 */
export function ReviewDetailClient({
  prNumberParam,
  reviewTabParam,
}: {
  prNumberParam: string;
  reviewTabParam: string;
}) {
  const navigate = useNavigate();
  const { basePath, repoId, owner, name } = useRepo();
  const prNumber = Number(prNumberParam);
  const isValidPrNumber = Number.isFinite(prNumber) && prNumber > 0;
  const tab = isReviewTab(reviewTabParam) ? reviewTabParam : REVIEW_DEFAULT_TAB;

  const prUrl = isValidPrNumber
    ? githubPrUrl(owner, name, prNumber)
    : undefined;

  const getHeader = useAction(api.github.getPullRequestHeader);
  // Cached, so a warmed or revisited PR shows its title on the first paint
  // instead of a spinner. Rendering `data` ahead of `isError` also means a failed
  // revalidate keeps the title that is already on screen.
  const headerQuery = useQuery(
    prHeaderQuery(getHeader, repoId, isValidPrNumber ? prNumber : undefined),
  );
  const prHeader = headerQuery.data;
  // One Refresh for the page, renewing both the title block and the overview.
  // Handed to the tab panel so the header's overflow menu is the only place it
  // appears.
  const { refresh, refreshing } = usePrRefresh(repoId, prNumber);

  // Tab title matches how a PR is named everywhere else: "#123 Fix the thing".
  useEntityDocumentTitle(
    prHeader === undefined ? null : `#${prHeader.number} ${prHeader.title}`,
  );

  const goToTab = (nextTab: string) => {
    // basePath is already the router's internal `--` form on main
    // (`repoHref`); staging's slash-URL rewrite is not in this slice.
    void navigate({
      to: toInternalRepoHref(`${basePath}/reviews/${prNumber}/${nextTab}`),
      search: (prev) => prev,
    });
  };

  if (!isValidPrNumber) {
    return (
      <EntityNotFound
        entityLabel="pull request"
        backTo={`${basePath}/reviews`}
      />
    );
  }

  // Padding is owned by the header slot in `ReviewTabsPanel`, so this block sits
  // flush with the author and branch rows below it. Every control that acts on
  // the pull request lives in `PrHeaderActions`, beside this title on the same
  // row — including Refresh, which is why this block carries no chrome of its own.
  const header = (
    <>
      {prHeader !== undefined ? (
        <h1 className="min-w-0 text-xl font-semibold leading-tight tracking-tight">
          {prHeader.title}{" "}
          <span className="font-normal text-muted-foreground">
            #{prHeader.number}
          </span>
        </h1>
      ) : headerQuery.isError ? (
        <p className="text-sm text-destructive">
          {prErrorMessage(headerQuery.error, "Couldn't load pull request")}
        </p>
      ) : (
        <div className="flex h-7 items-center">
          <Spinner size="sm" />
        </div>
      )}
    </>
  );

  return (
    // Wraps the whole page (not just Diffs) so drafted comments survive a tab
    // switch. In the sandbox this provider is hoisted higher still, because the
    // chat composer reads the same pending comments.
    <PendingReviewCommentsProvider onOpenDiffsTab={() => goToTab("diffs")}>
      <ReviewTabsPanel
        repoId={repoId}
        prUrl={prUrl}
        prNumber={prNumber}
        activeTab={tab}
        onTabChange={goToTab}
        header={header}
        breadcrumb={
          <PrBreadcrumb basePath={basePath} owner={owner} name={name} />
        }
        refresh={{ run: refresh, running: refreshing }}
      />
    </PendingReviewCommentsProvider>
  );
}
