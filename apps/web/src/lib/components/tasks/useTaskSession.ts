"use client";

import type { Doc, Id } from "@eva/backend";
import { useOwnedSession } from "@/lib/components/sandbox/useOwnedSession";

/**
 * A task's sandbox and chat. A quick task runs on its own session; a project
 * task on its project's, where it keeps its own chat (`useOwnedSession`).
 */
export function useTaskSession(
  taskId: Id<"agentTasks">,
  task: Doc<"agentTasks"> | null | undefined,
) {
  return {
    ...useOwnedSession({ kind: "task", taskId }),
    isQuickTask: task != null && task.projectId === undefined,
  };
}

export type TaskSession = ReturnType<typeof useTaskSession>;
