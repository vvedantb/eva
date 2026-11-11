import { useLocalStorage } from "usehooks-ts";
import { useQueryStates } from "nuqs";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import {
  QUICK_TASK_SORT_DEFAULTS,
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
  quickTaskProjectParser,
  quickTaskUserParser,
  quickTaskAssigneeParser,
  quickTaskTagsParser,
} from "@/lib/search-params";

type QuickTaskView = "kanban" | "list";

interface QuickTaskFilters extends QuickTaskListFilters {
  view: QuickTaskView;
}

// Per-user presentation preference — kept in localStorage. Everything else
// (search, filters, sort) is shareable "what you're looking at" state that
// lives in the URL via nuqs — see the parsers below.
interface QuickTaskLocalFilters {
  view: QuickTaskView;
}

const LOCAL_DEFAULTS: QuickTaskLocalFilters = {
  view: "kanban",
};

// v2: product default sort flipped lastRun → updated; bump key so existing
// localStorage does not keep the old default sticky for returning users.
// Persisted objects from before the URL-state split still carry the old
// filter fields (q, project, tags, …) — harmless, we only ever read `view`.
const STORAGE_KEY = "quick-task-filters-v2";

export function useQuickTaskFilters(): [
  QuickTaskFilters,
  (patch: Partial<QuickTaskFilters>) => void,
] {
  const [localFilters, setLocalFilters] =
    useLocalStorage<QuickTaskLocalFilters>(STORAGE_KEY, LOCAL_DEFAULTS);

  const [urlFilters, setUrlFilters] = useQueryStates({
    q: searchParser,
    project: quickTaskProjectParser,
    user: quickTaskUserParser,
    assignee: quickTaskAssigneeParser,
    tags: quickTaskTagsParser,
    sortField: quickTaskSortFieldParser,
    sortDir: quickTaskSortDirParser,
    timeRange: quickTaskTimeRangeParser,
    statuses: statusesParser,
  });

  // Merge defaults on read so objects persisted before the URL-state split
  // (or missing `view` entirely) backfill without a STORAGE_KEY bump. The
  // removed "table" view can still be sitting in a returning user's storage,
  // so anything that is not a live view falls back to the default.
  const merged = { ...LOCAL_DEFAULTS, ...localFilters };
  const local: QuickTaskLocalFilters = {
    view: merged.view === "list" ? "list" : "kanban",
  };
  // Sort is null until the user picks one, so it can fall back to the default.
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

// Regroup an already-sorted array into kanban order: tasks bucketed by status
// in TASK_STATUSES order, preserving the input array's relative order within
// each bucket. Used so prev/next on the detail page matches the kanban's
// visual top-to-bottom-then-rightward flow.
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
