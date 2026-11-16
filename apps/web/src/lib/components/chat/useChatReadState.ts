import { useDocumentVisible } from "@vvedantb/ui";
import {
  useChatReadState as useSharedChatReadState,
  type ChatReadParentId,
} from "@eva/shared/chatReadState";

/**
 * Read state of the open chat, for every surface (session, quick task,
 * project) from one place in ChatBody: the shared hook, "on screen" meaning
 * the route is active and the tab is visible. Cached hidden session shells
 * pass `active: false`, so they never clear their own dot.
 *
 * `parentId` is absent for Manager Ave, which has no read state.
 */
export function useChatReadState({
  parentId,
  active,
}: {
  parentId: ChatReadParentId | undefined;
  active: boolean;
}): { newSinceAt: number | undefined } {
  const visible = useDocumentVisible();
  return useSharedChatReadState({ parentId, active: active && visible });
}
