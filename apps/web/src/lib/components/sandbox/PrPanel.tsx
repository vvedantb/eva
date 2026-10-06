"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, isViewableRecap, type Id } from "@eva/backend";
import type { ReviewTab } from "@/lib/search-params";
import { prNumberFromGithubUrl } from "@/lib/githubPr";
import { ReviewTabsPanel } from "@/lib/components/reviews/ReviewTabsPanel";
import { usePrTabParam } from "./usePrTabParam";

interface PrPanelProps {
  prUrl?: string;
  repoId: Id<"githubRepos">;
  isActive: boolean;
}

/**
 * Sandbox Review tab. Owns only what is specific to this surface — reading the
 * active tab from the path (`…/review/summary`, `…/review/timeline`,
 * `…/review/diffs/…`, with `?prTab=` as a fallback) and defaulting to Summary,
 * where the recap leads, when a ready recap exists. The tabs themselves come from `ReviewTabsPanel`, shared
 * with the standalone Reviews page.
 */
export function PrPanel({ prUrl, repoId, isActive }: PrPanelProps) {
  const { prTab, setPrTab } = usePrTabParam();
  // Same cached query as ReviewTabsPanel's, so this costs no extra request.
  const recapDoc = useQuery(
    api.docs.getRecapByPrUrl,
    prUrl ? { repoId, prUrl } : "skip",
  );
  const [resolvedDefault, setResolvedDefault] = useState<ReviewTab | null>(
    null,
  );
  const prNumber =
    prUrl !== undefined ? prNumberFromGithubUrl(prUrl) : undefined;

  // Resolve the default tab once recap query settles (adjust during render).
  if (isActive && resolvedDefault === null) {
    if (!prUrl) {
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
      repoId={repoId}
      prUrl={prUrl}
      prNumber={prNumber}
      activeTab={prTab ?? resolvedDefault ?? "diffs"}
      onTabChange={setPrTab}
    />
  );
}
