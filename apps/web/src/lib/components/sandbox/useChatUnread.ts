import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";

/**
 * Whether one task or project chat has a reply the user has not seen. For the
 * detail page's sandbox tab: `api.projects.get` and the task detail query do
 * not carry the list rows' `hasUnread`. Same query the open chat body reads, so
 * the Convex client serves both from one subscription. `false` while loading.
 */
export function useChatUnread(
  parentId: Id<"agentTasks"> | Id<"projects">,
): boolean {
  const state = useQuery(api.chatReads.isUnread, { parentId });
  return state?.hasUnread === true;
}
