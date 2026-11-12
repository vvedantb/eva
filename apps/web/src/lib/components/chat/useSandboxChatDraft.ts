import {
  useChatDraftSeed,
  type ChatDraftSeed,
  type ChatDraftTarget,
} from "./useChatDraftSeed";

/**
 * The persisted chat draft for `target`, once its query has resolved. ChatBody
 * must not seed its editor while `isDraftLoading` is true. No target (a chat
 * not created yet) has nothing to persist.
 */
export function useSandboxChatDraft(target: ChatDraftTarget | undefined): {
  draftBundle: ChatDraftSeed | undefined;
  isDraftLoading: boolean;
} {
  const draftSeed = useChatDraftSeed(target);
  const draftBundle =
    target && draftSeed.isReady
    ? {
        target,
        initialDisplay: draftSeed.initialDisplay,
        mentionMap: draftSeed.mentionMap,
        skillMap: draftSeed.skillMap,
      }
    : undefined;
  return { draftBundle, isDraftLoading: !draftSeed.isReady };
}
