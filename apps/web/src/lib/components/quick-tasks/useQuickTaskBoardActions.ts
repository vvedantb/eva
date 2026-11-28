import { useState, type MouseEvent } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { runAllPlan, startAll } from "@eva/shared";
import { patchLoadedQuery } from "@vvedantb/server";
import { toast, useRequestConfirm } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";

type Task = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];

/**
 * The actions the quick-task board and list share: a status change (a drag),
 * Run All on the To Do group with its confirm, and which tasks' latest run
 * failed. One copy, so the two views cannot drift.
 */
export function useQuickTaskBoardActions(
  tasks: readonly Task[],
  archived: boolean,
) {
  const { repoId } = useRepo();
  const currentUserId = useQuery(api.auth.me);
  const updateStatus = useMutation(
    api.agentTasks.updateStatus,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(localStore, api.agentTasks.getAllTasks, { repoId }, (cur) =>
      cur.map((task) =>
        task._id === args.id
          ? { ...task, status: args.status, updatedAt: Date.now() }
          : task,
      ),
    );
  });
  const startExecution = useMutation(api.agentTasks.startExecution);
  const errorTaskIds = useQuery(api.agentTasks.getTaskIdsWithFailedRun, {
    repoId,
    taskIds: tasks.map((task) => task._id),
  });
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();

  const { owned: ownedTodoTasks, skippedCount } = runAllPlan(
    tasks,
    currentUserId ?? undefined,
  );

  const changeStatus = async (id: Id<"agentTasks">, status: Task["status"]) => {
    if (archived) return;
    try {
      await updateStatus({ id, status });
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Could not change the task status. Try again.");
    }
  };

  const runAll = async () => {
    if (ownedTodoTasks.length === 0) return;
    setIsRunningAll(true);
    const failedCount = await startAll(ownedTodoTasks, (task) =>
      startExecution({ id: task._id }),
    );
    if (failedCount > 0) {
      console.error(
        `Run All started ${ownedTodoTasks.length - failedCount} of ${ownedTodoTasks.length} tasks`,
      );
      toast.error(
        `Could not start ${failedCount} of ${ownedTodoTasks.length} tasks.`,
      );
    }
    setIsRunningAll(false);
  };

  return {
    currentUserId,
    errorTaskIdSet: new Set<string>(errorTaskIds ?? []),
    changeStatus,
    showRunAll: !archived && tasks.some((task) => task.status === "todo"),
    isRunningAll,
    requestRunAll: (event: MouseEvent) =>
      requestConfirm(
        () => setIsConfirmOpen(true),
        () => {
          void runAll();
        },
        event,
      ),
    runAllDialog: {
      isOpen: isConfirmOpen,
      onOpenChange: setIsConfirmOpen,
      ownedCount: ownedTodoTasks.length,
      skippedCount,
      onConfirm: runAll,
      isLoading: isRunningAll,
    },
  };
}
