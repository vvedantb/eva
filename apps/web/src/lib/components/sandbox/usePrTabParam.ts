"use client";

import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { canonicalReviewTab, type ReviewTab } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

const REVIEW_DIFFS_PATH = /\/review\/diffs(?:\/(?:unified|split))?\/?$/;
const REVIEW_PLAIN_PATH = /\/review\/([a-z]+)\/?$/;

function prTabFromPathname(pathname: string): ReviewTab | undefined {
  if (REVIEW_DIFFS_PATH.test(pathname)) return "diffs";
  const plain = REVIEW_PLAIN_PATH.exec(pathname)?.[1];
  return plain === undefined ? undefined : canonicalReviewTab(plain);
}

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
  const router = useRouter();
  const prTab = useRouterState({
    select: (s): ReviewTab | undefined => {
      const pathTab = prTabFromPathname(s.location.pathname);
      if (pathTab !== undefined) return pathTab;
      const search = s.location.search;
      const searchTabValue = "prTab" in search ? search.prTab : undefined;
      return typeof searchTabValue === "string"
        ? canonicalReviewTab(searchTabValue)
        : undefined;
    },
  });

  const setPrTab = (tab: ReviewTab, pr?: string) => {
    const withPr = pr === undefined ? {} : { pr };
    const pathname = router.state.location.pathname;
    if (prTabFromPathname(pathname) !== undefined) {
      const reviewBase = pathname.replace(/\/review\/.*$/, "/review");
      const viewMatch = pathname.match(/\/review\/diffs\/(unified|split)/);
      const view = viewMatch?.[1] ?? "unified";
      const nextPath = `${reviewBase}/${reviewSubPath(tab, view)}`;
      if (nextPath === pathname && pr === undefined) return;
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
