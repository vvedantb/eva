import { useEffect, useRef } from "react";
import { usePromptInputController } from "@vvedantb/ui";
import type { MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";

interface LocalChatDraftSyncProps {
  mentionRef: React.RefObject<MentionTextareaHandle | null>;
  initialDisplay: string;
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

  /* eslint-disable no-effect/no-event-handler, no-effect/no-pass-data-to-parent --
     Same shape as ChatDraftSync: the editor value is provider-owned and changes
     from several places, so persisting it lives here rather than in a handler. */
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
  /* eslint-enable no-effect/no-event-handler, no-effect/no-pass-data-to-parent */

  return null;
}
