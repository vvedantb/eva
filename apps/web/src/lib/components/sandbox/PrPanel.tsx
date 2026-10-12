"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useQueryState } from "nuqs";
import {
  api,
  isViewableRecap,
  type Id,
  type SandboxOwner,
} from "@eva/backend";
import { reviewPullRequestParser, type ReviewTab } from "@/lib/search-params";
import { prNumberFromGithubUrl } from "@/lib/githubPr";
import { ReviewTabsPanel } from "@/lib/components/reviews/ReviewTabsPanel";
import { usePrTabParam } from "./usePrTabParam";

interface PrPanelProps {
  /** The chat whose pull requests this pane reviews. */
  owner: SandboxOwner;
  /**
   * The chat's own PR from its summary. Shown when the chat holds no PR rows
   * yet (a chat whose PR predates the `pullRequests` backfill).
   */
  prUrl?: string;
  /** The chat's repo; a linked repo's PR is reviewed against its own repo. */
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
  // Read through nuqs; written by `setPrTab`, which moves to Summary in the
  // same navigation.
  const [selectedParam] = useQueryState("pr", reviewPullRequestParser);
  // Primary first, then newest — so with no choice made, the chat's own PR.
  const selected =
    pullRequests?.find((pr) => pr._id === selectedParam) ?? pullRequests?.[0];
  const reviewUrl = selected?.prUrl ?? prUrl;
  const reviewRepoId = selected?.repoId ?? repoId;

  // Same cached query as ReviewTabsPanel's, so this costs no extra request.
  const recapDoc = useQuery(
    api.docs.getRecapByPrUrl,
    reviewUrl ? { repoId: reviewRepoId, prUrl: reviewUrl } : "skip",
  );
  const [resolvedDefault, setResolvedDefault] = useState<ReviewTab | null>(
    null,
  );
  const prNumber =
    reviewUrl !== undefined ? prNumberFromGithubUrl(reviewUrl) : undefined;

  // Resolve the default tab once recap query settles (adjust during render).
  if (isActive && resolvedDefault === null) {
    if (!reviewUrl) {
      setResolvedDefault("diffs");
    } else if (recapDoc !== undefined) {
      // Only open on Summary when there is a walkthrough to lead it: otherwise
      // the code is what a reader opens a session's review for.
      setResolvedDefault(
        recapDoc !== null && isViewableRecap(recapDoc) ? "summary" : "diffs",
      );
    }
  }

  return (
    <ReviewTabsPanel
      // A different PR is a different review: drafts, the scoped commit and
      // scroll belong to the PR they were made on.
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
