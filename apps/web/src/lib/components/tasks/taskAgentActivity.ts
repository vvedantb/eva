import type { Id } from "@eva/backend";
import { useChatTurnOpen } from "@/lib/components/chat/useChatTurnOpen";

/**
 * Eva is working on this task right now: a turn is open in its chat (a run
 * is a chat turn), synthetic turns included. One "sandbox busy" status, the
 * same rule list rows carry from the server as `isExecuting`
 * (`taskIsExecuting`).
 *
 * Presentation only: the kanban column and the status badge stay keyed off the
 * persisted `status`, so this never moves a card between columns.
 */
export function useTaskAgentActive(
  /** The task's session chat; undefined before it exists. */
  chatParentId: Id<"sessionChats"> | undefined,
): boolean {
  return useChatTurnOpen(chatParentId) === true;
}
