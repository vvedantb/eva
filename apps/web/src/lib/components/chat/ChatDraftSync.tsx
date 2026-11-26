import { useEffect, useRef } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { usePromptInputController } from "@vvedantb/ui";
import { useDraftAutosave } from "@/lib/hooks/useDraftAutosave";
import { decideDraftPull, rememberOwnSave } from "@eva/shared";
import type { MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";
import type { ChatDraftTarget } from "./useChatDraftSeed";

interface ChatDraftSyncProps {
  target: ChatDraftTarget;
  mentionRef: React.RefObject<MentionTextareaHandle | null>;
  initialDisplay: string;
}

/**
 * Invisible component rendered inside PromptInputProvider. Owns both directions
 * of the editor ↔ server draft sync, and is the only place that may use
 * `useEffect` for it.
 *
 * Push (editor → server): watches textInput.value and saves the tokenized draft
 * on every change, coalesced via useSingleFlight so rapid keystrokes don't
 * stampede the backend. Empty content → the mutation deletes the row (handles
 * both clear-on-send and the user manually clearing the input). The initial save
 * is skipped when the value equals the seeded display text.
 *
 * Pull (server → editor): watches the same `drafts` row that seeded the editor,
 * so a write from outside the composer — `useSeedChatDraft`, used by the
 * Approve plan action and the design-variation picker — appears live instead of only after a remount.
 */
export function ChatDraftSync({
  target,
  mentionRef,
  initialDisplay,
}: ChatDraftSyncProps) {
  const { textInput } = usePromptInputController();
  const { save } = useDraftAutosave(target, mentionRef);
  const remoteContent = useQuery(api.drafts.getForTarget, { target });

  const isMountedRef = useRef(false);
  const savedContentsRef = useRef<string[]>([]);

  /* eslint-disable no-effect/no-event-handler --
     The editor value is owned by `PromptInputProvider` and changes from typing,
     paste, programmatic seeds and clear-on-send alike; this component exists
     precisely to be the one place that persists all of them. */
  useEffect(() => {
    const tokenized =
      mentionRef.current?.tokenize(textInput.value) ?? textInput.value;
    savedContentsRef.current = rememberOwnSave(
      savedContentsRef.current,
      tokenized,
    );

    if (!isMountedRef.current) {
      isMountedRef.current = true;
      if (textInput.value === initialDisplay) {
        return;
      }
    }

    save(textInput.value);
  }, [textInput.value]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable no-effect/no-event-handler */

  useEffect(() => {
    const decision = decideDraftPull({
      remoteContent,
      editorValue: textInput.value,
      ownSaves: savedContentsRef.current,
    });
    if (!decision.apply) return;

    mentionRef.current?.addTokenMaps(decision.mentionMap, decision.skillMap);
    textInput.setInput(decision.displayText);
  }, [remoteContent]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
