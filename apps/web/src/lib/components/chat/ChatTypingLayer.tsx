"use client";

import type { Id } from "@eva/backend";
import { useTypingPresence } from "@/lib/hooks/useTypingPresence";
import { TypingIndicator } from "@/lib/components/chat/TypingIndicator";
import { PromptInputTypingBridge } from "@/lib/components/chat/PromptInputTypingBridge";

/**
 * Wires teammate typing presence into a ChatBody composer. Must be rendered
 * inside the <PromptInputProvider> so the bridge can read the input value; the
 * indicator is absolutely positioned to float just above the input.
 */
export function ChatTypingLayer({
  roomId,
  userId,
}: {
  roomId: string;
  userId: Id<"users"> | undefined;
}) {
  const { typingUsers, onActivity, stopTyping } = useTypingPresence(
    roomId,
    userId,
  );
  return (
    <>
      <PromptInputTypingBridge onActivity={onActivity} onIdle={stopTyping} />
      <TypingIndicator
        users={typingUsers}
        // Anchored to ChatComposer's padded `relative` root; the left inset
        // matches its padding so the indicator lines up with the input.
        className="absolute bottom-full left-3 md:left-4"
      />
    </>
  );
}
