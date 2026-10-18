import { useQuery } from "convex/react";
import { useReplyChime } from "@vvedantb/ui";
import { api } from "@eva/backend";

/**
 * Plays the reply chime once when the agent finishes a turn,
 * behind the `replyChime` experimental flag (off until opted in).
 *
 * Lives in ChatBody so every chat surface (session, quick task, project) gets
 * it from one place, and keys off `isExecuting` — the same flag the composer
 * uses to decide between send and enqueue — so "finished" here means exactly
 * what it means everywhere else in the chat.
 *
 * Audio only, and only locally: a session can be watched by several people, so
 * `isOwnTurn` keeps the chime with the person who prompted the turn rather than
 * sounding on every teammate's machine. The edge is tracked while disabled, so
 * turning the flag on mid-turn chimes on the next finish, not a stale one.
 */
export function useAgentReplyChime({
  conversationId,
  isExecuting,
  isOwnTurn,
}: {
  conversationId: string;
  isExecuting: boolean;
  isOwnTurn: boolean;
}): void {
  const flags = useQuery(api.auth.getExperimentalFlags);
  useReplyChime({
    enabled: flags?.replyChime === true && isOwnTurn,
    isStreaming: isExecuting,
    threadId: conversationId,
  });
}
