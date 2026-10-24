import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { toast } from "@vvedantb/ui";
import type { ChatDraftTarget } from "@/lib/components/chat/useChatDraftSeed";

/**
 * Hands a prefilled prompt to a chat surface from outside its composer (the
 * design preview, the PRD plan view). Writes the same `drafts` row that
 * `useChatDraftSeed` reads, appending to whatever the user already had so a
 * half-typed message is never clobbered.
 */
export function useSeedChatDraft(
  target: ChatDraftTarget,
): (text: string) => Promise<void> {
  const existing = useQuery(api.drafts.getForTarget, { target });
  const setDraft = useMutation(api.drafts.set);

  return async (text: string) => {
    const current = existing ?? "";
    const content =
      current.trim().length === 0 ? text : `${current}\n\n${text}`;
    await setDraft({ target, content });
    toast.success("Added to your chat draft");
  };
}
