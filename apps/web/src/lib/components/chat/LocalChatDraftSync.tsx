import { useEffect, useRef } from "react";
import { usePromptInputController } from "@eva/ui";
import type { MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";

interface LocalChatDraftSyncProps {
  mentionRef: React.RefObject<MentionTextareaHandle | null>;
  /** Display text that seeded the editor at mount — skip the redundant first save. */
  initialDisplay: string;
  /** Persist tokenized draft (empty string clears). */
  onSave: (tokenized: string) => void;
}

/**
 * Like ChatDraftSync, but writes to a local callback (e.g. useLocalStorage)
 * instead of Convex — used when no conversation exists yet (new session).
 */
export function LocalChatDraftSync({
  mentionRef,
  initialDisplay,
  onSave,
}: LocalChatDraftSyncProps) {
  const { textInput } = usePromptInputController();
  const isMountedRef = useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      if (textInput.value === initialDisplay) {
        return;
      }
    }

    const visible = textInput.value;
    const tokenized = mentionRef.current?.tokenize(visible) ?? visible;
    onSave(tokenized);
  }, [textInput.value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Same dep rationale as ChatDraftSync: seed/skip only needs mount; mentionRef
  // is a stable ref; onSave identity changes are fine for a local write.

  return null;
}
