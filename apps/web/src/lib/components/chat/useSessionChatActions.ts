"use client";

import { api, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** Rename for one session chat tab, with the shared failure toast. */
export function useSessionChatActions() {
  const renameMutation = useMutation(api.sessionChats.rename);

  const renameChat = async (chatId: Id<"sessionChats">, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await catchMutationError(
      renameMutation({ chatId, title: trimmed }),
      "Couldn't rename chat",
      "session-chat-rename",
    );
  };

  return { renameChat };
}
