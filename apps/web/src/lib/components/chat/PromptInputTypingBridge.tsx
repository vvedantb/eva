"use client";

import { useEffect, useRef } from "react";
import { usePromptInputController } from "@vvedantb/ui";

/**
 * Headless bridge for PromptInput-based composers (e.g. ChatBody). Watches the
 * controller's text value and reports typing activity: onActivity while there
 * is text, onIdle once it is cleared (e.g. after submit). Renders nothing and
 * must be mounted inside a <PromptInputProvider>.
 */
export function PromptInputTypingBridge({
  onActivity,
  onIdle,
}: {
  onActivity: () => void;
  onIdle: () => void;
}) {
  const { textInput } = usePromptInputController();
  const value = textInput.value;

  const seenInitial = useRef(false);

  useEffect(() => {
    if (!seenInitial.current) {
      seenInitial.current = true;
      return;
    }
    if (value.trim().length > 0) onActivity();
    else onIdle();
  }, [value, onActivity, onIdle]);

  return null;
}
