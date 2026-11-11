import { isTaskRunning, type Id, type TaskRunSource } from "@eva/backend";
import { useChatTurnOpen } from "@/lib/components/chat/useChatTurnOpen";

/**
 * Eva is working on this task right now: its main run or its chat turn,
 * synthetic turns included. One "sandbox busy" status, the same rule list rows
 * carry from the server as `isExecuting` (`taskIsExecuting`).
 *
 * Presentation only: the kanban column and the status badge stay keyed off the
 * persisted `status`, so this never moves a card between columns.
 */
export function useTaskAgentActive(
  taskId: Id<"agentTasks">,
  task: TaskRunSource | null | undefined,
): boolean {
  const chatTurnOpen = useChatTurnOpen(taskId);
  return (task ? isTaskRunning(task) : false) || chatTurnOpen === true;
}
