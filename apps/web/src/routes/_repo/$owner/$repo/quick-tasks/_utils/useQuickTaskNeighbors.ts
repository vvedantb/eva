"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { useFilteredQuickTasks, useQuickTaskFilters } from "../_utils";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

interface UseQuickTaskNeighborsArgs {
  taskId: string;
  /** Whether the open surface is the detail tabs or the sandbox. */
  navSurface: "detail" | "sandbox";
  sandboxTab?: TaskRouteSandboxTab;
}

/**
 * Shared prev/next + back navigation for an open quick task. Walks the same
 * filtered+grouped task order the list/kanban renders, so stepping through
 * tasks matches their visual order. Used by both the full-page detail shell and
 * the list-view master/detail split, keeping the two surfaces in sync.
 */
export function useQuickTaskNeighbors({
  taskId,
  navSurface,
  sandboxTab,
}: UseQuickTaskNeighborsArgs) {
  const navigate = useNavigate();
  const { basePath, repo } = useRepo();
  const [{ view }] = useQuickTaskFilters();

  const tasks = useQuery(api.agentTasks.getAllTasks, { repoId: repo._id });

  const selectedTask = tasks?.find((t) => t._id === taskId);

  const orderedTasks = useFilteredQuickTasks(tasks, {
    // Kanban and list both render tasks grouped by status, so prev/next must
    // walk that same order. Only the table view is a flat sorted list.
    groupByStatus: view === "kanban" || view === "list",
  });

  const neighborIds = (() => {
    if (orderedTasks.length === 0) {
      return { prevTaskId: null, nextTaskId: null };
    }
    const idx = orderedTasks.findIndex((t) => t._id === taskId);
    if (idx === -1) return { prevTaskId: null, nextTaskId: null };
    return {
      prevTaskId: idx > 0 ? orderedTasks[idx - 1]._id : null,
      nextTaskId:
        idx < orderedTasks.length - 1 ? orderedTasks[idx + 1]._id : null,
    };
  })();
  const { prevTaskId, nextTaskId } = neighborIds;

  const goToTask = (id: Id<"agentTasks">) => {
    const task = orderedTasks.find((t) => t._id === id);
    const segment = task ? entityPathSegment(task) : null;
    if (!segment) return;
    if (navSurface === "sandbox" && sandboxTab) {
      if (sandboxTab === "review") {
        void navigate({
          to: toInternalRepoHref(
            `${basePath}/quick-tasks/${segment}/sandbox/review/diffs/unified`,
          ),
          search: (prev) => prev,
        });
        return;
      }
      void navigate({
        to: toInternalRepoHref(
          `${basePath}/quick-tasks/${segment}/sandbox/${sandboxTab}`,
        ),
        search: (prev) => prev,
      });
      return;
    }
    navigate({
      to: toInternalRepoHref(`${basePath}/quick-tasks/${segment}`),
      search: (prev) => prev,
    });
  };

  return {
    tasks,
    selectedTask,
    prevTaskId,
    nextTaskId,
    handleNavigatePrev: () => {
      if (prevTaskId) goToTask(prevTaskId);
    },
    handleNavigateNext: () => {
      if (nextTaskId) goToTask(nextTaskId);
    },
    handleBack: () => {
      navigate({
        to: toInternalRepoHref(`${basePath}/quick-tasks`),
        search: (prev) => prev,
      });
    },
  };
}
