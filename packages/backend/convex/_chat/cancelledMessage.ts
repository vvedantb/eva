type CancelledMessage = {
  role: string;
  content?: string;
  activityLog?: string;
  finishedAt?: number;
};

type StreamedState = {
  currentContent?: string;
  currentActivity?: string;
} | null;

/**
 * `skip` leaves the message alone (not ours, or already finished); `delete`
 * removes an empty bubble; `patch` keeps what streamed, filling only the fields
 * the message does not already have.
 */
export type CancelledMessageOutcome =
  | { kind: "skip" }
  | { kind: "delete" }
  | { kind: "patch"; content?: string; activityLog?: string };

function hasToolActivity(activity: string | undefined): boolean {
  if (activity === undefined) return false;
  const trimmed = activity.trim();
  return trimmed.length > 0 && trimmed !== "[]";
}

/**
 * The stop path used to overwrite the message with "Execution cancelled by
 * user.", throwing away the answer the agent had already streamed. So the rule
 * is: persist the stream, and only delete when the turn truly produced nothing.
 */
export function cancelledMessageOutcome(
  message: CancelledMessage,
  streaming: StreamedState,
): CancelledMessageOutcome {
  if (message.role !== "assistant" || message.finishedAt !== undefined) {
    return { kind: "skip" };
  }

  const streamedContent = streaming?.currentContent?.trim() ?? "";
  const streamedActivity = streaming?.currentActivity;
  const hadStreamedActivity = hasToolActivity(streamedActivity);
  const hadPersistedActivity = hasToolActivity(message.activityLog);

  if (
    !message.content &&
    !streamedContent &&
    !hadStreamedActivity &&
    !hadPersistedActivity
  ) {
    return { kind: "delete" };
  }

  const outcome: CancelledMessageOutcome = { kind: "patch" };
  if (!message.content && streamedContent) {
    outcome.content = streamedContent;
  }
  if (hadStreamedActivity && streamedActivity !== undefined) {
    outcome.activityLog = streamedActivity;
  }
  return outcome;
}
