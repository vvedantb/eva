"use client";

import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false });

  const diffFileValue = "diffFile" in search ? search.diffFile : undefined;
  const diffFile = typeof diffFileValue === "string" ? diffFileValue : "";

  const pathMatch = pathname.match(DIFF_VIEW_PATH);
  const pathView: DiffView | undefined =
    pathMatch !== null && isDiffView(pathMatch[1]) ? pathMatch[1] : undefined;

  const searchViewValue = "diffView" in search ? search.diffView : undefined;
  const searchView: DiffView | undefined =
    typeof searchViewValue === "string" && isDiffView(searchViewValue)
      ? searchViewValue
      : undefined;

  const diffView: DiffView = pathView ?? searchView ?? "unified";

  const setDiffFile = (path: string) => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, diffFile: path }),
      replace: true,
    });
  };

  const setDiffView = (view: DiffView) => {
    if (pathMatch !== null) {
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
