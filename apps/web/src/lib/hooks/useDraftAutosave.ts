import type { RefObject } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@eva/backend";
import { useSingleFlight } from "@vvedantb/ui";

/**
 * Minimal shape the autosave needs from a mention editor ref: a tokenizer that
 * converts the editor's display text (with @Label / /Label chips) into the
 * stored `@[Label](id)` token form. Satisfied by `MentionEditorHandle` and its
 * aliases (`MentionTextareaHandle`, `CommentMentionInputHandle`).
 */
interface DraftTokenizer {
  tokenize: (text: string) => string;
}

/** Draft target union — sourced from the backend mutation so it stays in sync. */
type DraftTarget = FunctionArgs<typeof api.drafts.set>["target"];

/**
 * Centralizes the draft write mechanic shared by every composer surface
 * (session chat, design chat, task comments, comment replies):
 *
 * - `save(rawValue)` tokenizes the editor value via the mention ref, then
 *   persists it through a single-flight-wrapped `drafts.set` so rapid
 *   keystrokes coalesce to one in-flight save.
 * - `clear()` writes empty content, which the mutation treats as "delete the
 *   row" — call it after a successful send.
 *
 * The read/seed counterpart lives in `tokenizedToEditable` / `useChatDraftSeed`.
 */
export function useDraftAutosave<T extends DraftTokenizer>(
  target: DraftTarget,
  mentionRef: RefObject<T | null>,
): { save: (rawValue: string) => void; clear: () => void } {
  const setDraft = useMutation(api.drafts.set);
  const saveDraft = useSingleFlight(setDraft);

  const save = (rawValue: string): void => {
    // Tokenize at save time so stored content carries mention/skill ids.
    const content = mentionRef.current?.tokenize(rawValue) ?? rawValue;
    void saveDraft({ target, content });
  };

  const clear = (): void => {
    void saveDraft({ target, content: "" });
  };

  return { save, clear };
}
