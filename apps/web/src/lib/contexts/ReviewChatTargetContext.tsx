"use client";

import { createContext, useContext } from "react";
import type { ChatDraftTarget } from "@/lib/components/chat/useChatDraftSeed";

const ReviewChatTargetContext = createContext<ChatDraftTarget | null>(null);

export const ReviewChatTargetProvider = ReviewChatTargetContext;

export function useReviewChatTarget(): ChatDraftTarget | null {
  return useContext(ReviewChatTargetContext);
}
