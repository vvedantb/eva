import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";

type TurnShapeMessage = {
  _id: string;
  role: string;
  content: string;
  isSystemAlert?: boolean;
  finishedAt?: number;
};

type ChatTurnStatus = NonNullable<
  FunctionReturnType<typeof api.turns.getChatStatus>
>;

/**
 * Whether an assistant turn is executing for one chat. One rule for every
 * surface (session, quick task, project), every reader of it (composer,
 * queue, subagent thread, Agents roster, design panel) and both apps, so they
 * cannot disagree on the same chat:
 * - the chat's durable turn is canonical, synthetic turns included, and so is
 *   an open task run streaming into the chat (`turns.getChatStatus`);
 * - except when that turn's own reply bubble has finished: the server closes
 *   the turn and finishes its bubble in one mutation, so a finished bubble
 *   proves the turn is over even if the status the client holds is stale
 *   (seen in prod: Stop button and beam stayed until a refresh);
 * - message shape only covers the first render while that status loads, so a
 *   stale empty bubble cannot keep a settled turn "executing".
 * Streaming rows are not an input: they can outlive their turn, so callers
 * gate them on this result instead.
 */
export function isChatTurnExecuting({
  status,
  messages,
}: {
  status: ChatTurnStatus | null | undefined;
  messages: ReadonlyArray<TurnShapeMessage> | undefined;
}): boolean {
  if (status === undefined) return isAssistantTurnInProgress(messages ?? []);
  if (status === null) return false;
  if (status.source !== "durable" || status.placeholderMessageId === undefined) {
    return true;
  }
  const reply = messages?.find((m) => m._id === status.placeholderMessageId);
  return reply?.finishedAt === undefined;
}

function isAssistantTurnInProgress(
  messages: ReadonlyArray<TurnShapeMessage>,
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.isSystemAlert) continue;
    return (
      message.role === "assistant" &&
      !message.content &&
      message.finishedAt === undefined
    );
  }
  return false;
}
