import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import {
  ghostSuggestion,
  scheduleCompletion,
  shouldSkipPrediction,
} from "@vvedantb/ui";

export interface InlineSuggestion {
  /** Ghost text to render after the caret, or undefined when there is none. */
  suggestion: string | undefined;
  /** Suppress the current suggestion until the text changes again. */
  dismiss: () => void;
}

/**
 * Inline AI completion for a prose field: after a typing pause, asks the gateway
 * to finish the current sentence and returns it as ghost text for the caller to
 * render. The caller owns accepting it (append `suggestion` to its own value).
 *
 * Pass `contextHint` describing what the field is for — it doubles as the
 * on/off switch, so a field that omits it gets no completions at all.
 *
 * Staleness needs no abort tokens: a result is only surfaced while the value it
 * was requested for still matches the current value, so a slow response for an
 * older draft is simply never shown, and accepting one hides it by changing the
 * value.
 */
export function useInlineSuggestion(
  value: string,
  contextHint: string | undefined,
): InlineSuggestion {
  const completeText = useAction(api.textGen.completeText);
  const [result, setResult] = useState<{
    forValue: string;
    text: string;
  } | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const skip = contextHint === undefined || shouldSkipPrediction(value);
  const alreadyHave = result?.forValue === value;
  const dismissed = dismissedFor === value;

  useEffect(() => {
    if (skip || alreadyHave || dismissed || contextHint === undefined) return;
    return scheduleCompletion(
      value,
      (text) => completeText({ text, contextHint }),
      (text) => setResult({ forValue: value, text }),
    );
  }, [value, contextHint, skip, alreadyHave, dismissed, completeText]);

  const suggestion =
    !skip && !dismissed && result?.forValue === value
      ? ghostSuggestion(value, result.text)
      : undefined;

  return { suggestion, dismiss: () => setDismissedFor(value) };
}
