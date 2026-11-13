"use client";

import { api, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

/** Rename and delete for one session chat tab, with the shared toasts. */
export function useSessionChatActions() {
  const renameMutation = useMutation(api.sessionChats.rename);
  const removeMutation = useMutation(api.sessionChats.remove);

  const renameChat = async (chatId: Id<"sessionChats">, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await catchMutationError(
      renameMutation({ chatId, title: trimmed }),
      "Couldn't rename chat",
      "session-chat-rename",
    );
  };

  /** Throws on failure (after the toast) so the caller keeps its dialog open. */
  const deleteChat = async (chatId: Id<"sessionChats">) => {
    await withMutationToast(
      removeMutation({ chatId }),
      "Chat deleted",
      "Couldn't delete chat",
      "session-chat-delete",
    );
  };

  return { renameChat, deleteChat };
}
