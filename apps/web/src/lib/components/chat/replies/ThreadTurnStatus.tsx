"use client";

import { threadTurnStatusText } from "@eva/shared";
import { TypingDots } from "@/lib/components/chat/TypingIndicator";

/**
 * Above the coordinator chat's composer while Eva's turn answers in a reply
 * thread: the main chat has no bubble for it, so this line says where she
 * is, or that she waits on a question there. The root's first words open that
 * thread. Same muted 12px line and dots as the teammate typing indicator; a
 * question has no dots, as she is waiting, not writing.
 */
export function ThreadTurnStatus({
  preview,
  hasQuestion,
  onOpen,
}: {
  preview: string;
  hasQuestion: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="mx-auto flex w-[calc(100%-1.5rem)] min-w-0 items-center gap-1.5 pb-1.5 text-xs text-muted-foreground"
    >
      <span className="shrink-0">{threadTurnStatusText(hasQuestion)}</span>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {preview}
      </button>
      {hasQuestion ? null : <TypingDots />}
    </div>
  );
}
