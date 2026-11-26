"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useQueryState } from "nuqs";
import {
  api,
  isViewableRecap,
  type Id,
  type PrOwnerRef,
} from "@eva/backend";
import { reviewPullRequestParser, type ReviewTab } from "@/lib/search-params";
import { prNumberFromGithubUrl } from "@eva/shared";
import { ReviewTabsPanel } from "@/lib/components/reviews/ReviewTabsPanel";
import { usePrTabParam } from "./usePrTabParam";

interface PrPanelProps {
  owner: PrOwnerRef;
  prUrl?: string;
  repoId: Id<"githubRepos">;
  isActive: boolean;
}

/**
 * Sandbox Review tab. Owns only what is specific to this surface — reading the
 * active tab from the path (`…/review/summary`, `…/review/timeline`,
 * `…/review/diffs/…`, `…/review/prs`, with `?prTab=` as a fallback),
 * defaulting to Summary when a ready recap exists, and which of the chat's
 * pull requests the tabs show (`?pr=`, else the primary). The tabs themselves
 * come from `ReviewTabsPanel`, shared with the standalone Reviews page.
 */
export function PrPanel({ owner, prUrl, repoId, isActive }: PrPanelProps) {
  const { prTab, setPrTab } = usePrTabParam();
  const pullRequests = useQuery(api.pullRequests.listForOwner, { owner });
  const [selectedParam] = useQueryState("pr", reviewPullRequestParser);
  const selected =
    pullRequests?.find((pr) => pr._id === selectedParam) ?? pullRequests?.[0];
  const reviewUrl = selected?.prUrl ?? prUrl;
  const reviewRepoId = selected?.repoId ?? repoId;

  const recapDoc = useQuery(
    api.docs.getRecapByPrUrl,
    reviewUrl ? { repoId: reviewRepoId, prUrl: reviewUrl } : "skip",
  );
  const [resolvedDefault, setResolvedDefault] = useState<ReviewTab | null>(
    null,
  );
  const prNumber =
    reviewUrl !== undefined ? prNumberFromGithubUrl(reviewUrl) : undefined;

  if (isActive && resolvedDefault === null) {
    if (!reviewUrl) {
      setResolvedDefault("diffs");
    } else if (recapDoc !== undefined) {
      setResolvedDefault(
        recapDoc !== null && isViewableRecap(recapDoc) ? "summary" : "diffs",
      );
    }
  }

  return (
    <ReviewTabsPanel
      key={reviewUrl ?? "none"}
      repoId={reviewRepoId}
      prUrl={reviewUrl}
      prNumber={prNumber}
      activeTab={prTab ?? resolvedDefault ?? "diffs"}
      onTabChange={setPrTab}
      pullRequests={{
        items: pullRequests ?? [],
        selectedId: selected?._id,
        onSelect: (id) => setPrTab("summary", id),
      }}
    />
  );
}
