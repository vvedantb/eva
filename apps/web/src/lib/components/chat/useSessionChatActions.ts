"use client";

import { api, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { catchMutationError, mutationSuccess } from "@/lib/utils/mutationToast";

/**
 * Rename / close for one session chat tab, shared by the chat header's tab
 * strip and the sidebar's indented chat rows so both surfaces toast and fail
 * the same way.
 */
export function useSessionChatActions() {
  const renameMutation = useMutation(api.sessionChats.rename);
  const archiveMutation = useMutation(api.sessionChats.archive);

  const renameChat = async (chatId: Id<"sessionChats">, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await catchMutationError(
      renameMutation({ chatId, title: trimmed }),
      "Couldn't rename chat",
      "session-chat-rename",
    );
  };

  const closeChat = async (chatId: Id<"sessionChats">) => {
    await catchMutationError(
      archiveMutation({ chatId }),
      "Couldn't close chat",
      "session-chat-close",
    );
    mutationSuccess("Chat closed", "session-chat-close");
  };

  return { renameChat, closeChat };
}
