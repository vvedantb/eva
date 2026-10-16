"use client";

import { createContext, useContext } from "react";
import type { ChatDraftTarget } from "@/lib/components/chat/useChatDraftSeed";

/**
 * The chat beside a sandbox's Review tab — a session chat tab, a quick task or
 * a project. Review actions that hand work to an agent ("Ask agent" on a recap
 * step) put it in this chat's draft. Absent on the Reviews page and in
 * Documents, where there is no chat beside the review.
 */
const ReviewChatTargetContext = createContext<ChatDraftTarget | null>(null);

export const ReviewChatTargetProvider = ReviewChatTargetContext;

export function useReviewChatTarget(): ChatDraftTarget | null {
  return useContext(ReviewChatTargetContext);
}
