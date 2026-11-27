"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { Spinner } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PendingReviewCommentsProvider } from "@/lib/contexts/PendingReviewCommentsContext";
import { githubPrUrl } from "@eva/shared";
import { prErrorMessage, prHeaderQuery } from "@/lib/prReviewQueries";
import { REVIEW_DEFAULT_TAB, isReviewTab } from "@/lib/search-params";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { ReviewTabsPanel } from "./ReviewTabsPanel";
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

  const getHeader = useAction(api.github.getPullRequestHeader);  const headerQuery = useQuery(
    prHeaderQuery(getHeader, repoId, isValidPrNumber ? prNumber : undefined),
  );
  const prHeader = headerQuery.data;  const { refresh, refreshing } = usePrRefresh(repoId, prNumber);
  useEntityDocumentTitle(
    prHeader === undefined ? null : `#${prHeader.number} ${prHeader.title}`,
  );

  const goToTab = (nextTab: string) => {    void navigate({
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
  const placeholder =
    prHeader !== undefined ? (
      <h1 className="min-w-0 truncate text-base font-semibold leading-snug">
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
      <div className="flex h-6 items-center">
        <Spinner size="sm" />
      </div>
    );

  return (    <PendingReviewCommentsProvider onOpenDiffsTab={() => goToTab("diffs")}>
      <ReviewTabsPanel
        repoId={repoId}
        prUrl={prUrl}
        prNumber={prNumber}
        activeTab={tab}
        onTabChange={goToTab}
        placeholder={placeholder}
        refresh={{ run: refresh, running: refreshing }}
      />
    </PendingReviewCommentsProvider>
  );
}
