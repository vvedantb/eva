"use client";

import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { isReviewTab, type ReviewTab } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

/** Matches `/review/diffs…` or any of the single-segment review sub-tabs. */
const REVIEW_DIFFS_PATH = /\/review\/diffs(?:\/(?:unified|split))?\/?$/;
const REVIEW_PLAIN_PATH = /\/review\/(overview|commits|checks|recap)\/?$/;

function prTabFromPathname(pathname: string): ReviewTab | undefined {
  if (REVIEW_DIFFS_PATH.test(pathname)) return "diffs";
  const plain = REVIEW_PLAIN_PATH.exec(pathname)?.[1];
  return plain !== undefined && isReviewTab(plain) ? plain : undefined;
}

/** Diffs is the one sub-tab with a nested segment of its own. */
function reviewSubPath(tab: ReviewTab, diffView: string): string {
  return tab === "diffs" ? `diffs/${diffView}` : tab;
}

/**
 * Review panel sub-tab. Prefers path segments (`…/review/overview`,
 * `…/review/commits`, `…/review/checks`, `…/review/diffs/…`, `…/review/recap`)
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
    typeof searchTabValue === "string" && isReviewTab(searchTabValue)
      ? searchTabValue
      : undefined;

  const prTab = pathTab ?? searchTab;

  const setPrTab = (tab: ReviewTab) => {
    if (pathTab !== undefined) {
      const reviewBase = pathname.replace(/\/review\/.*$/, "/review");
      const viewMatch = pathname.match(/\/review\/diffs\/(unified|split)/);
      const view = viewMatch?.[1] ?? "unified";
      const nextPath = `${reviewBase}/${reviewSubPath(tab, view)}`;
      if (nextPath === pathname) return;
      // Pathname is usually already `--` form, but `navigate({ to })` does
      // not run the history rewrite. Internalize so a slash-form monorepo
      // path cannot miss the route tree.
      void navigate({
        to: toInternalRepoHref(nextPath),
        search: true,
        replace: true,
      });
      return;
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, prTab: tab }),
      replace: true,
    });
  };

  return { prTab, setPrTab };
}
