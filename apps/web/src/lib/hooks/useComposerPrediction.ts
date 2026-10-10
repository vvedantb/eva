import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import type { InlineSuggestion } from "@/lib/hooks/useInlineSuggestion";

export interface ComposerPredictionTarget {
  /** The chat the prediction reads. */
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;
  /** Newest message in the chat; a new one asks for a fresh prediction. */
  lastMessageId: string;
}

/**
 * Composer prediction: the user's likely next message after the agent finishes
 * a turn, as ghost text for an empty composer (Codex "composer predictions").
 * The caller owns accepting it (set the value to `suggestion`).
 *
 * Pass `target` only while the chat waits on the user (agent idle, chat on
 * screen) — it doubles as the on/off switch. The server checks again and
 * returns "" for a running, failed or question-asking turn.
 *
 * One request per message: the result is keyed by `lastMessageId`, so typing
 * and clearing the draft shows the same prediction again without a new call,
 * and a stale result never shows under a newer reply.
 */
export function useComposerPrediction(
  value: string,
  target: ComposerPredictionTarget | undefined,
): InlineSuggestion {
  const predict = useAction(api.textGen.predictNextMessage);
  const [result, setResult] = useState<{
    forMessageId: string;
    text: string;
  } | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const parentId = target?.parentId;
  const messageId = target?.lastMessageId;
  const isEmpty = value === "";
  const alreadyHave = result?.forMessageId === messageId;

  useEffect(() => {
    if (!parentId || !messageId || !isEmpty || alreadyHave) return;
    predict({ parentId })
      .then((text) => setResult({ forMessageId: messageId, text }))
      .catch(console.error);
  }, [parentId, messageId, isEmpty, alreadyHave, predict]);

  const suggestion =
    messageId !== undefined &&
    isEmpty &&
    dismissedFor !== messageId &&
    result?.forMessageId === messageId &&
    result.text
      ? result.text
      : undefined;

  return {
    suggestion,
    dismiss: () => setDismissedFor(messageId ?? null),
  };
}
