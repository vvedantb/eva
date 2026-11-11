import {
  TASK_STATUSES,
  priorityCompare,
  statusWorkflowOrder,
  type DisplayTaskStatus,
  type Priority,
  type TaskStatus,
} from "./taskMeta";

/**
 * The Quick Tasks list's search, filters and sort, shared by the web list
 * (the toolbar Options menu and the active-filter chips) and the phone list.
 * Pure: the web keeps the state in the URL, the phone in the screen.
 */

/** The web toolbar order of the sort fields. */
export const QUICK_TASK_SORT_FIELDS = ["status", "updated", "lastRun", "created", "title", "priority"] as const;
export type QuickTaskSortField = (typeof QUICK_TASK_SORT_FIELDS)[number];
export type QuickTaskSortDir = "asc" | "desc";

export const QUICK_TASK_SORT_FIELD_LABELS: Record<QuickTaskSortField, string> = {
  status: "Status",
  lastRun: "Last Run",
  updated: "Updated",
  created: "Created",
  title: "Title",
  priority: "Priority",
};

export const QUICK_TASK_TIME_RANGES = ["7d", "30d", "90d", "all"] as const;
export type QuickTaskTimeRange = (typeof QUICK_TASK_TIME_RANGES)[number];

export const QUICK_TASK_TIME_RANGE_LABELS: Record<QuickTaskTimeRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_RANGE_MS: Record<Exclude<QuickTaskTimeRange, "all">, number> = {
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

/**
 * What the list shows. `project` is "all", "none" (no project, the default:
 * quick tasks are the ones outside projects) or a project id; `user` (the
 * creator) is "all" or a user id; `assignee` (the code reviewer) is "all",
 * "unassigned" or a user id.
 */
export interface QuickTaskListFilters {
  q: string;
  project: string;
  user: string;
  assignee: string;
  tags: string[];
  statuses: DisplayTaskStatus[];
  timeRange: QuickTaskTimeRange;
  sortField: QuickTaskSortField;
  sortDir: QuickTaskSortDir;
}

export type QuickTaskFilterKey = "project" | "user" | "assignee" | "statuses" | "tags" | "timeRange";

/** The filters "no filters applied" means. Read-only: spread or copy before handing the arrays on. */
export const QUICK_TASK_FILTER_DEFAULTS: Readonly<Pick<QuickTaskListFilters, QuickTaskFilterKey>> = {
  project: "none",
  user: "all",
  assignee: "all",
  tags: [],
  statuses: [...TASK_STATUSES],
  timeRange: "all",
};

/** Used when no sort is picked: both views show status already, so recency is the useful order. */
export const QUICK_TASK_SORT_DEFAULTS: Readonly<Pick<QuickTaskListFilters, "sortField" | "sortDir">> = {
  sortField: "updated",
  sortDir: "desc",
};

/** The list as it opens: no search, no filters, the default sort. */
export const QUICK_TASK_LIST_DEFAULTS: Readonly<QuickTaskListFilters> = {
  q: "",
  ...QUICK_TASK_FILTER_DEFAULTS,
  ...QUICK_TASK_SORT_DEFAULTS,
};

/** The task fields the filters and sorts read. */
export type FilterableQuickTask = {
  title: string;
  description?: string;
  status: TaskStatus;
  projectId?: string;
  createdBy?: string;
  assignedTo?: string;
  tags?: string[];
  priority?: Priority;
  createdAt: number;
  updatedAt: number;
  lastRunStartedAt?: number;
};

/**
 * The tasks the list shows, in its order: the search (title or description),
 * then every filter, drafts left out, then the sort. `now` anchors the time
 * range.
 */
export function applyQuickTaskFilters<T extends FilterableQuickTask>(
  tasks: readonly T[],
  filters: QuickTaskListFilters,
  now = Date.now(),
): T[] {
  const query = filters.q.trim().toLowerCase();
  const statuses = new Set<string>(filters.statuses);
  const tags = new Set(filters.tags);
  const cutoff = filters.timeRange === "all" ? undefined : now - TIME_RANGE_MS[filters.timeRange];
  const shown = tasks.filter((task) => {
    if (query && !task.title.toLowerCase().includes(query) && !task.description?.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.project === "none" ? task.projectId !== undefined : filters.project !== "all" && task.projectId !== filters.project) {
      return false;
    }
    if (filters.user !== "all" && task.createdBy !== filters.user) return false;
    if (filters.assignee === "unassigned" ? task.assignedTo !== undefined : filters.assignee !== "all" && task.assignedTo !== filters.assignee) {
      return false;
    }
    if (task.status === "draft" || !statuses.has(task.status)) return false;
    if (tags.size > 0 && !task.tags?.some((tag) => tags.has(tag))) return false;
    return cutoff === undefined || task.createdAt >= cutoff;
  });
  // `filter` copied the array, so `sort` mutates nothing shared; `toSorted` is missing in some Hermes release builds.
  return shown.sort((a, b) => {
    let cmp = 0;
    if (filters.sortField === "status") {
      // Workflow order, not alphabetical; ties keep the newest update first in either direction.
      cmp = statusWorkflowOrder(a.status) - statusWorkflowOrder(b.status);
      if (cmp === 0) return b.updatedAt - a.updatedAt;
    } else if (filters.sortField === "lastRun") {
      // A task that never ran sorts by when it was made, not as 0 at the bottom.
      cmp = (a.lastRunStartedAt ?? a.createdAt) - (b.lastRunStartedAt ?? b.createdAt);
    } else if (filters.sortField === "updated") {
      cmp = a.updatedAt - b.updatedAt;
    } else if (filters.sortField === "created") {
      cmp = a.createdAt - b.createdAt;
    } else if (filters.sortField === "title") {
      cmp = a.title.localeCompare(b.title);
    } else {
      cmp = priorityCompare(a.priority, b.priority);
    }
    return filters.sortDir === "asc" ? cmp : -cmp;
  });
}

/** A filter that differs from its default: the toolbar shows "Clear all filters". */
export function hasActiveQuickTaskFilters(filters: QuickTaskListFilters): boolean {
  return activeQuickTaskFilterKeys(filters).length > 0;
}

/** The filters that differ from their defaults, in the web chip order. */
export function activeQuickTaskFilterKeys(filters: QuickTaskListFilters): QuickTaskFilterKey[] {
  const keys: QuickTaskFilterKey[] = [];
  if (filters.project !== QUICK_TASK_FILTER_DEFAULTS.project) keys.push("project");
  if (filters.user !== QUICK_TASK_FILTER_DEFAULTS.user) keys.push("user");
  if (filters.assignee !== QUICK_TASK_FILTER_DEFAULTS.assignee) keys.push("assignee");
  if (filters.statuses.length !== TASK_STATUSES.length) keys.push("statuses");
  if (filters.tags.length > 0) keys.push("tags");
  if (filters.timeRange !== QUICK_TASK_FILTER_DEFAULTS.timeRange) keys.push("timeRange");
  return keys;
}

/** The patch that clears one filter back to its default. */
export function clearedQuickTaskFilter(key: QuickTaskFilterKey): Partial<QuickTaskListFilters> {
  switch (key) {
    case "project":
      return { project: QUICK_TASK_FILTER_DEFAULTS.project };
    case "user":
      return { user: QUICK_TASK_FILTER_DEFAULTS.user };
    case "assignee":
      return { assignee: QUICK_TASK_FILTER_DEFAULTS.assignee };
    case "statuses":
      return { statuses: [...TASK_STATUSES] };
    case "tags":
      return { tags: [] };
    case "timeRange":
      return { timeRange: QUICK_TASK_FILTER_DEFAULTS.timeRange };
  }
}

/** Every filter back to its default (search and sort stay). */
export function clearedQuickTaskFilters(): Pick<QuickTaskListFilters, QuickTaskFilterKey> {
  return { ...QUICK_TASK_FILTER_DEFAULTS, tags: [], statuses: [...TASK_STATUSES] };
}

/**
 * One "Filtered by" chip: `text`, then `person` (a teammate's name, which the
 * web marks as personal data) when the filter names one.
 */
export type QuickTaskFilterChip = { key: QuickTaskFilterKey; text: string; person?: string };

/** The active filters as the web chips name them. */
export function quickTaskFilterChips(
  filters: QuickTaskListFilters,
  names: { project: (id: string) => string | undefined; user: (id: string) => string | undefined },
): QuickTaskFilterChip[] {
  return activeQuickTaskFilterKeys(filters).map((key): QuickTaskFilterChip => {
    switch (key) {
      case "project":
        return {
          key,
          text: filters.project === "all" ? "All Projects" : `Project: ${names.project(filters.project) ?? "Project"}`,
        };
      case "user":
        return { key, text: "Created by: ", person: names.user(filters.user) ?? "User" };
      case "assignee":
        return filters.assignee === "unassigned"
          ? { key, text: "Code reviewer: Unassigned" }
          : { key, text: "Code reviewer: ", person: names.user(filters.assignee) ?? "Code Reviewer" };
      case "statuses":
        return { key, text: `${filters.statuses.length} Status${filters.statuses.length !== 1 ? "es" : ""}` };
      case "tags":
        return { key, text: `${filters.tags.length} Tag${filters.tags.length !== 1 ? "s" : ""}` };
      case "timeRange":
        return { key, text: QUICK_TASK_TIME_RANGE_LABELS[filters.timeRange] };
    }
  });
}

/**
 * Toggles one status in the Statuses filter. The last one stays: an empty
 * filter would hide every task.
 */
export function toggleQuickTaskStatus(statuses: readonly DisplayTaskStatus[], status: DisplayTaskStatus): DisplayTaskStatus[] {
  if (!statuses.includes(status)) return [...statuses, status];
  return statuses.length === 1 ? [...statuses] : statuses.filter((entry) => entry !== status);
}

/**
 * Run All on the To Do section: only a task's creator can run Eva on it, so
 * the user's own To Do tasks start and the rest are skipped. `start` is the
 * web `agentTasks.startExecution`; one failure does not stop the others.
 */
export function runAllPlan<T extends { status: TaskStatus; createdBy?: string }>(
  tasks: readonly T[],
  userId: string | undefined,
): { owned: T[]; skippedCount: number } {
  const todo = tasks.filter((task) => task.status === "todo");
  const owned = todo.filter((task) => userId !== undefined && task.createdBy === userId);
  return { owned, skippedCount: todo.length - owned.length };
}

/** Starts each task at once; resolves to how many failed to start. */
export async function startAll<T>(tasks: readonly T[], start: (task: T) => Promise<unknown>): Promise<number> {
  const started = await Promise.all(
    tasks.map((task) =>
      start(task).then(
        () => true,
        () => false,
      ),
    ),
  );
  return started.filter((ok) => !ok).length;
}
