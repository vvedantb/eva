import { useRouterState } from "@tanstack/react-router";
import { sandboxTabIdFromParam } from "@/lib/search-params";

const SESSION_REVIEW_PATH = /\/sessions\/[^/]+\/review(?:\/|$)/;

/**
 * Active sandbox tab for the current session detail URL.
 *
 * Builtin tabs and custom-tab name slugs come from `$sandboxTab`; Review lives
 * under nested `/review/…` routes (no `$sandboxTab` param).
 */
export function useSessionRouteSandboxTab(): string {
  return useRouterState({
    select: (s) => {
      if (SESSION_REVIEW_PATH.test(s.location.pathname)) return "review";
      for (const match of s.matches) {
        const sandboxTab =
          "sandboxTab" in match.params ? match.params.sandboxTab : undefined;
        if (typeof sandboxTab === "string" && sandboxTab.length > 0) {
          return sandboxTabIdFromParam(sandboxTab);
        }
      }
      return "preview";
    },
  });
}
