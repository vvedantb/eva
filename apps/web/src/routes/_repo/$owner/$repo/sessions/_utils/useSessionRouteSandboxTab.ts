import { useParams, useRouterState } from "@tanstack/react-router";
import { sandboxTabIdFromParam } from "@/lib/search-params";

/** Matches `/sessions/$numId/review…` (diffs or recap). */
const SESSION_REVIEW_PATH = /\/sessions\/[^/]+\/review(?:\/|$)/;

/**
 * Active sandbox tab for the current session detail URL.
 *
 * Builtin tabs and custom-tab name slugs come from `$sandboxTab`; Review lives
 * under nested `/review/…` routes (no `$sandboxTab` param).
 */
export function useSessionRouteSandboxTab(): string {
  const params = useParams({ strict: false });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (SESSION_REVIEW_PATH.test(pathname)) {
    return "review";
  }

  const sandboxTab = params.sandboxTab;
  if (typeof sandboxTab === "string" && sandboxTab.length > 0) {
    return sandboxTabIdFromParam(sandboxTab);
  }

  return "preview";
}
