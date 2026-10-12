"use client";

import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { canonicalReviewTab, type ReviewTab } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

/** Matches `/review/diffs…` or any of the single-segment review sub-tabs. */
const REVIEW_DIFFS_PATH = /\/review\/diffs(?:\/(?:unified|split))?\/?$/;
const REVIEW_PLAIN_PATH = /\/review\/([a-z]+)\/?$/;

function prTabFromPathname(pathname: string): ReviewTab | undefined {
  if (REVIEW_DIFFS_PATH.test(pathname)) return "diffs";
  const plain = REVIEW_PLAIN_PATH.exec(pathname)?.[1];
  // Legacy slugs (`overview`, `recap`, …) redirect, but read through the map
  // too so the panel never flashes the default tab during that redirect.
  return plain === undefined ? undefined : canonicalReviewTab(plain);
}

/** Diffs is the one sub-tab with a nested segment of its own. */
function reviewSubPath(tab: ReviewTab, diffView: string): string {
  return tab === "diffs" ? `diffs/${diffView}` : tab;
}

/**
 * Review panel sub-tab. Prefers path segments (`…/review/summary`,
 * `…/review/timeline`, `…/review/diffs/…`)
 * on sessions/projects/quick-tasks and falls back to `?prTab=` only when those
 * paths are absent.
 */
export function usePrTabParam() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false });

  const pathTab = prTabFromPathname(pathname);

  const searchTabValue = "prTab" in search ? search.prTab : undefined;
  const searchTab: ReviewTab | undefined =
    typeof searchTabValue === "string"
      ? canonicalReviewTab(searchTabValue)
      : undefined;

  const prTab = pathTab ?? searchTab;

  /**
   * Switches tab. `pr` also picks which of the chat's pull requests the tabs
   * show, in the same navigation — a second URL write racing this one would
   * land on the old path and undo the switch.
   */
  const setPrTab = (tab: ReviewTab, pr?: string) => {
    const withPr = pr === undefined ? {} : { pr };
    if (pathTab !== undefined) {
      const reviewBase = pathname.replace(/\/review\/.*$/, "/review");
      const viewMatch = pathname.match(/\/review\/diffs\/(unified|split)/);
      const view = viewMatch?.[1] ?? "unified";
      const nextPath = `${reviewBase}/${reviewSubPath(tab, view)}`;
      if (nextPath === pathname && pr === undefined) return;
      // Pathname is usually already `--` form, but `navigate({ to })` does
      // not run the history rewrite. Internalize so a slash-form monorepo
      // path cannot miss the route tree.
      void navigate({
        to: toInternalRepoHref(nextPath),
        search: (prev) => ({ ...prev, ...withPr }),
        replace: true,
      });
      return;
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, prTab: tab, ...withPr }),
      replace: true,
    });
  };

  return { prTab, setPrTab };
}
