import { useEffect, useRef } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { usePromptInputController } from "@eva/ui";
import { useDraftAutosave } from "@/lib/hooks/useDraftAutosave";
import { decideDraftPull, rememberOwnSave } from "./chatDraftPull";
import type { MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";
import type { ChatDraftTarget } from "./useChatDraftSeed";

interface ChatDraftSyncProps {
  target: ChatDraftTarget;
  mentionRef: React.RefObject<MentionTextareaHandle | null>;
  /** The display text that seeded the editor at mount — used to skip the
   * redundant initial save when the value equals the already-persisted draft. */
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
 * compaction banner, the Approve plan action and the design-variation picker —
 * appears live instead of only after a remount.
 */
export function ChatDraftSync({
  target,
  mentionRef,
  initialDisplay,
}: ChatDraftSyncProps) {
  const { textInput } = usePromptInputController();
  const { save } = useDraftAutosave(target, mentionRef);
  // Cached `useQuery` dedupes with the identical subscription `useChatDraftSeed`
  // already holds for this target, so the pull costs no extra bandwidth.
  const remoteContent = useQuery(api.drafts.getForTarget, { target });

  // Track whether this is the very first render so we can skip the redundant
  // initial save when the input value matches what we seeded from the draft.
  const isMountedRef = useRef(false);
  // Every tokenized content this client has put on the wire, newest last.
  const savedContentsRef = useRef<string[]>([]);

  useEffect(() => {
    const tokenized =
      mentionRef.current?.tokenize(textInput.value) ?? textInput.value;
    // Whatever the editor holds is by definition not an external change. Record
    // it before saving so the pull effect can recognise the echo when the
    // subscription replays it.
    savedContentsRef.current = rememberOwnSave(
      savedContentsRef.current,
      tokenized,
    );

    // On the first run the value will equal initialDisplay (seeded from the
    // persisted draft). Saving it back is a no-op on the server, but it wastes
    // a round-trip on every session mount. Skip it.
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      if (textInput.value === initialDisplay) {
        return;
      }
    }

    // Tokenize + persist via the shared autosave; an empty value deletes the
    // row server-side (handles clear-on-send and manual clearing alike).
    save(textInput.value);
  }, [textInput.value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Intentionally omitting target/mentionRef/save/initialDisplay from
  // the dep array: target is stable (keyed to session id), mentionRef is a ref,
  // save identity changes are inconsequential for an autosave effect, and
  // initialDisplay is only needed for the mount-skip guard which uses a ref.

  useEffect(() => {
    // Every guard — loading, external delete, echo, and the additive rule that
    // stops a lagging row deleting characters mid-typing — lives in
    // `decideDraftPull`, where it is unit-tested.
    const decision = decideDraftPull({
      remoteContent,
      editorValue: textInput.value,
      ownSaves: savedContentsRef.current,
    });
    if (!decision.apply) return;

    // Maps first: the chips for the incoming tokens must resolve before the
    // display text referencing them lands in the editor.
    mentionRef.current?.addTokenMaps(decision.mentionMap, decision.skillMap);
    textInput.setInput(decision.displayText);
    // The save effect fires on this value change and writes the same content
    // back — a server no-op, and it records the content as ours so the echo
    // cannot bounce back through here.
  }, [remoteContent]); // eslint-disable-line react-hooks/exhaustive-deps
  // Deliberately keyed to the subscription alone: textInput.value is read for
  // the guards but must not re-trigger the push, or a server value that lags
  // the user's latest keystroke would be re-applied on every edit.

  return null;
}
