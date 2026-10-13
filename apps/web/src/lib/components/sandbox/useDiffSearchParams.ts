"use client";

import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { isDiffView, type DiffView } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

const DIFF_VIEW_PATH = /\/review\/diffs\/(unified|split)\/?$/;

/**
 * Diffs tab file selection (`?diffFile=`) and layout view.
 * Sessions use path segments (`…/review/diffs/unified|split`); other surfaces
 * may still use `?diffView=`.
 */
export function useDiffSearchParams() {
  const navigate = useNavigate();
  const router = useRouter();
  // Primitive selections: the whole pathname/search object changes on every
  // navigation, which re-rendered each kept-alive diff consumer with it.
  const diffFile = useRouterState({
    select: (s) => {
      const search = s.location.search;
      const value = "diffFile" in search ? search.diffFile : undefined;
      return typeof value === "string" ? value : "";
    },
  });
  const diffView = useRouterState({
    select: (s): DiffView => {
      const pathMatch = s.location.pathname.match(DIFF_VIEW_PATH);
      if (pathMatch !== null && isDiffView(pathMatch[1])) return pathMatch[1];
      const search = s.location.search;
      const value = "diffView" in search ? search.diffView : undefined;
      return typeof value === "string" && isDiffView(value) ? value : "unified";
    },
  });

  const setDiffFile = (path: string) => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, diffFile: path }),
      replace: true,
    });
  };

  const setDiffView = (view: DiffView) => {
    // Read at call time so this handler stays stable across navigations.
    const pathname = router.state.location.pathname;
    if (DIFF_VIEW_PATH.test(pathname)) {
      const nextPath = pathname.replace(
        DIFF_VIEW_PATH,
        `/review/diffs/${view}`,
      );
      if (nextPath === pathname) return;
      void navigate({
        to: toInternalRepoHref(nextPath),
        search: true,
        replace: true,
      });
      return;
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, diffView: view }),
      replace: true,
    });
  };

  return { diffFile, diffView, setDiffFile, setDiffView };
}
