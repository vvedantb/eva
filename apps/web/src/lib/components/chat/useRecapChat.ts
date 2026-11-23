import { api } from "@eva/backend";
import { useMutation } from "convex/react";
import type { ChatReadParentId } from "@eva/shared/chatReadState";
import { catchMutationError } from "@/lib/utils/mutationToast";

/**
 * "Recap chat" in a chat's menu (session, quick task, project): asks for a
 * recap of the whole chat. It lands as the "Recap" card under the newest
 * message, like the away recap. Undefined until the chat exists.
 */
export function useRecapChat(
  parentId: ChatReadParentId | undefined,
): (() => void) | undefined {
  const requestFull = useMutation(api.chatRecaps.requestFull);
  if (parentId === undefined) return undefined;
  return () => {
    catchMutationError(
      requestFull({ parentId }),
      "Couldn't recap this chat",
      "recap-chat",
    ).catch(() => undefined);
  };
}
