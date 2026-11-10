import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type SandboxOwner } from "@eva/backend";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import type { PrMenuPullRequest } from "./PrActionsSubmenus";

/**
 * A chat's PR rows for its menus, primary first. Simple view hides git and PR
 * plumbing, so it skips the query and returns none. Menus mount their content
 * on open, so a list of cards pays for this only on the card opened.
 */
export function useOwnerPullRequests(
  owner: SandboxOwner | undefined,
): readonly PrMenuPullRequest[] {
  const simpleView = useSimpleView();
  const rows = useQuery(
    api.pullRequests.listForOwner,
    owner !== undefined && !simpleView ? { owner } : "skip",
  );
  return rows ?? [];
}
