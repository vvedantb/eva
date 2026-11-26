import { useLocalStorage } from "usehooks-ts";
import { useQueryStates } from "nuqs";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import {
  QUICK_TASK_SORT_DEFAULTS,
  quickTaskTodoDrafts,
  applyQuickTaskFilters,
  groupByTaskStatus,
  type QuickTaskListFilters,
} from "@eva/shared";
import {
  searchParser,
  statusesParser,
  quickTaskSortDirParser,
  quickTaskSortFieldParser,
  quickTaskTimeRangeParser,
  quickTaskUserParser,
  quickTaskAssigneeParser,
  quickTaskTagsParser,
} from "@/lib/search-params";

/** Quick task views in their toolbar order (the content slides by it). */
export const QUICK_TASK_VIEWS = ["kanban", "list"] as const;
export type QuickTaskView = (typeof QUICK_TASK_VIEWS)[number];

interface QuickTaskFilters extends QuickTaskListFilters {
  view: QuickTaskView;
}

interface QuickTaskLocalFilters {
  view: QuickTaskView;
}

const LOCAL_DEFAULTS: QuickTaskLocalFilters = {
  view: "kanban",
};

const STORAGE_KEY = "quick-task-filters-v2";

export function useQuickTaskFilters(): [
  QuickTaskFilters,
  (patch: Partial<QuickTaskFilters>) => void,
] {
  const [localFilters, setLocalFilters] =
    useLocalStorage<QuickTaskLocalFilters>(STORAGE_KEY, LOCAL_DEFAULTS);

  const [urlFilters, setUrlFilters] = useQueryStates({
    q: searchParser,
    user: quickTaskUserParser,
    assignee: quickTaskAssigneeParser,
    tags: quickTaskTagsParser,
    sortField: quickTaskSortFieldParser,
    sortDir: quickTaskSortDirParser,
    timeRange: quickTaskTimeRangeParser,
    statuses: statusesParser,
  });

  const merged = { ...LOCAL_DEFAULTS, ...localFilters };
  const local: QuickTaskLocalFilters = {
    view: merged.view === "list" ? "list" : "kanban",
  };
  const { sortField, sortDir, ...url } = urlFilters;
  const filters: QuickTaskFilters = {
    ...local,
    ...url,
    sortField: sortField ?? QUICK_TASK_SORT_DEFAULTS.sortField,
    sortDir: sortDir ?? QUICK_TASK_SORT_DEFAULTS.sortDir,
  };

  const setParams = (patch: Partial<QuickTaskFilters>) => {
    const { view, ...urlPatch } = patch;
    if (view !== undefined) {
      setLocalFilters((prev) => ({ ...prev, view }));
    }
    if (Object.keys(urlPatch).length > 0) {
      void setUrlFilters(urlPatch);
    }
  };

  return [filters, setParams];
}

export type QuickTask = FunctionReturnType<
  typeof api.agentTasks.getAllTasks
>[number];

function groupByStatusOrder(tasks: QuickTask[]): QuickTask[] {
  return groupByTaskStatus(tasks).flatMap((section) => section.tasks);
}

export function useFilteredQuickTasks(
  tasks: QuickTask[] | undefined,
  options?: { groupByStatus?: boolean },
): QuickTask[] {
  const [filters] = useQuickTaskFilters();
  const groupByStatus = options?.groupByStatus ?? false;
  const sorted = applyQuickTaskFilters(tasks ?? [], filters);
  return groupByStatus ? groupByStatusOrder(sorted) : sorted;
}

/**
 * The current user's quick-task drafts the To Do group shows, under the
 * list's filters (`quickTaskTodoDrafts`). Shares the drafts query cache
 * with the page's `?draft=` modal.
 */
export function useQuickTaskTodoDrafts(repoId: Id<"githubRepos">) {
  const [filters] = useQuickTaskFilters();
  const drafts = useQuery(api.agentTasks.listDrafts, { repoId });
  return quickTaskTodoDrafts(drafts ?? [], filters);
}
