"use client";

import { useEffect, useRef } from "react";
import { usePromptInputController } from "@eva/ui";
import { isEditorValueEmpty } from "@/lib/components/mentions";
import type { MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";
import { isComposerVisible } from "@/lib/components/chat/_components/composerVisibility";

interface ChatTypeToFocusProps {
  /** Ref to the mention editor so a stray keystroke can focus it. */
  mentionRef: React.RefObject<MentionTextareaHandle | null>;
}

/**
 * "Type anywhere to focus" for the chat composer. When the composer is not
 * focused and the user presses a printable key outside any other editable
 * element, seed the composer with that character and focus it — so typing
 * "hello" from a cold view yields "hello" in the input rather than losing the
 * leading characters. Mirrors the type-to-search behaviour in Slack / Linear.
 *
 * Rendered as a child of `PromptInputProvider` (alongside ChatTypingLayer /
 * ChatDraftSync) so it can drive the shared text-input controller. It only
 * mounts when the composer itself is rendered, which naturally excludes the
 * archived / pending-question / draft-loading states.
 *
 * Mounted is not the same as visible, though: the sessions layout keeps up to
 * three session shells alive under `display: none` / `aria-hidden`, and Manager
 * Ave's panel never unmounts. A `document` listener therefore runs once per
 * mounted composer, so one keystroke was appended to every mounted draft — and
 * ChatDraftSync then persisted each of them. The handler asks
 * `isComposerVisible` whether this editor is the one on screen before it writes
 * anything, and a backgrounded tab owns no composer at all.
 *
 * Deliberately not gated on the composer's send-disabled state: the editor stays
 * contentEditable while a sandbox is stopped, so drafting must keep working
 * there too — only the submit button is disabled.
 */
export function ChatTypeToFocus({ mentionRef }: ChatTypeToFocusProps) {
  const controller = usePromptInputController();

  // Hold the latest input value in a ref so the keydown listener always reads
  // the current text without re-subscribing on every keystroke. While the
  // composer is unfocused its value is effectively static, but a restored draft
  // means it may be non-empty — appending keeps that draft intact.
  const valueRef = useRef(controller.textInput.value);
  const inputValue = controller.textInput.value;
  const setInput = controller.textInput.setInput;

  useEffect(() => {
    valueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only single printable characters. Modifier combos are shortcuts, and
      // keys like Enter / Tab / Backspace report multi-char `key` values.
      if (event.key.length !== 1) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Mid-IME-composition keystrokes belong to the composition, not us.
      if (event.isComposing) return;
      // Never steal input that is already going somewhere editable — the
      // composer itself, terminals, other inputs, or dialog fields.
      if (isEditableTarget(event.target)) return;
      // Only the composer the user can see may claim the keystroke.
      if (!isComposerVisible(mentionRef.current?.getElement())) return;

      // Cancel the default insertion (which would land on <body> and be lost),
      // then append the character and focus so subsequent keys flow in order.
      // A cleared composer reads back as "\n" (browser bogus <br>), so normalise
      // it away first — otherwise the seeded character lands on a second line.
      event.preventDefault();
      const current = valueRef.current;
      setInput((isEditorValueEmpty(current) ? "" : current) + event.key);
      mentionRef.current?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setInput, mentionRef]);

  return null;
}

/** True when the event originated inside an editable control. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
