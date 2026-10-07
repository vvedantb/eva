/**
 * A chat turn or a main run is live on this task — eva is replying right now.
 *
 * Presentation only: the kanban column and the status badge stay keyed off the
 * persisted `status`, so this never moves a card between columns.
 */
export function isTaskAgentActive(task: {
  activeChatWorkflowId?: string;
  activeWorkflowId?: string;
}): boolean {
  return (
    task.activeChatWorkflowId !== undefined ||
    task.activeWorkflowId !== undefined
  );
}
