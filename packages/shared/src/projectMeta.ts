import type { ProjectStage } from "./projectStatus";
import {
  TASK_STATUSES,
  priorityCompare,
  type DisplayTaskStatus,
  type Priority,
  type TaskStatus,
} from "./taskMeta";

export const PROJECT_SORT_FIELDS = ["created", "title", "priority"] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];
export type ProjectSortDir = "asc" | "desc";

export const PROJECT_SORT_FIELD_LABELS: Record<ProjectSortField, string> = {
  created: "Date Created",
  title: "Title",
  priority: "Priority",
};

/** Search, stage filter and sort of the projects list. `hiddenPhases` is a blocklist of derived stages, so a new stage shows by default. */
export interface ProjectListFilters {
  q: string;
  hiddenPhases: ProjectStage[];
  sortField: ProjectSortField;
  sortDir: ProjectSortDir;
}

export const PROJECT_LIST_DEFAULTS: ProjectListFilters = {
  q: "",
  hiddenPhases: [],
  sortField: "created",
  sortDir: "desc",
};

/** The fields `searchAndSortProjects` reads from a `projects.list` row. */
export interface SearchableProject {
  title: string;
  rawInput?: string;
  description?: string;
  priority?: Priority;
  _creationTime: number;
}

/** The projects matching the search in the title, raw input or description, sorted by the sort field. */
export function searchAndSortProjects<T extends SearchableProject>(
  projects: readonly T[],
  filters: Pick<ProjectListFilters, "q" | "sortField" | "sortDir">,
): T[] {
  const query = filters.q.toLowerCase().trim();
  return projects
    .filter((project) => {
      if (!query) return true;
      return (
        project.title.toLowerCase().includes(query) ||
        (project.rawInput?.toLowerCase().includes(query) ?? false) ||
        (project.description?.toLowerCase().includes(query) ?? false)
      );
    })
    .sort((a, b) => {
      const comparison =
        filters.sortField === "created"
          ? a._creationTime - b._creationTime
          : filters.sortField === "title"
            ? a.title.localeCompare(b.title)
            : priorityCompare(a.priority, b.priority);
      return filters.sortDir === "asc" ? comparison : -comparison;
    });
}

/**
 * Shows or hides one column in the list. The last visible column stays: the
 * list never hides every column.
 */
export function toggleHiddenProjectPhase<C extends string>(
  hiddenPhases: readonly C[],
  phase: C,
  allPhases: readonly C[],
): C[] {
  if (hiddenPhases.includes(phase))
    return hiddenPhases.filter((hidden) => hidden !== phase);
  const visibleCount = allPhases.filter(
    (candidate) => !hiddenPhases.includes(candidate),
  ).length;
  if (visibleCount <= 1) return [...hiddenPhases];
  return [...hiddenPhases, phase];
}

export type ProjectFilterKey = "phases" | "sortField" | "sortDir";

/** The "Filtered by" chips, in order: the phase count, a non-default sort field, ascending. */
export function projectFilterChips<C extends string>(
  filters: Omit<ProjectListFilters, "hiddenPhases"> & {
    hiddenPhases: readonly C[];
  },
  allPhases: readonly C[],
): Array<{ key: ProjectFilterKey; label: string }> {
  const chips: Array<{ key: ProjectFilterKey; label: string }> = [];
  if (filters.hiddenPhases.length > 0) {
    const visible = allPhases.filter(
      (phase) => !filters.hiddenPhases.includes(phase),
    ).length;
    chips.push({
      key: "phases",
      label: `${visible} Phase${visible !== 1 ? "s" : ""}`,
    });
  }
  if (filters.sortField !== "created") {
    chips.push({
      key: "sortField",
      label: `Sort: ${PROJECT_SORT_FIELD_LABELS[filters.sortField]}`,
    });
  }
  if (filters.sortDir !== "desc")
    chips.push({ key: "sortDir", label: "Ascending" });
  return chips;
}

/** What clearing filters sets: an empty column list fits any column type. */
export type ClearedProjectFilters = Partial<
  Pick<ProjectListFilters, "sortField" | "sortDir">
> & {
  hiddenPhases?: [];
};

/** The filters with one chip's filter back at its default. */
export function clearedProjectFilter(
  key: ProjectFilterKey,
): ClearedProjectFilters {
  switch (key) {
    case "phases":
      return { hiddenPhases: [] };
    case "sortField":
      return { sortField: "created" };
    case "sortDir":
      return { sortDir: "desc" };
  }
}

/** The filters "Clear all filters" restores (search stays). */
export function clearedProjectFilters(): ClearedProjectFilters {
  return { hiddenPhases: [], sortField: "created", sortDir: "desc" };
}

/** The fields `projectTaskSections` reads from an `agentTasks.listByProject` row. */
export interface SectionableProjectTask {
  status: TaskStatus;
  createdAt: number;
  lastRunStartedAt?: number;
}

/**
 * A project's task list: one section per status in workflow order. To Do
 * keeps the project's order (`taskNumber`, which reorder writes); every
 * other section puts the latest run first, else the newest task. A section
 * starts open when it has tasks and is not Merged or Cancelled.
 */
export function projectTaskSections<T extends SectionableProjectTask>(
  tasks: readonly T[],
): Array<{ status: DisplayTaskStatus; tasks: T[]; defaultOpen: boolean }> {
  const lastRun = (task: T) => task.lastRunStartedAt ?? task.createdAt;
  return TASK_STATUSES.map((status) => {
    const matching = tasks.filter((task) => task.status === status);
    const sorted =
      status === "todo"
        ? matching
        : matching.sort((a, b) => lastRun(b) - lastRun(a));
    return {
      status,
      tasks: sorted,
      defaultOpen:
        sorted.length > 0 && status !== "done" && status !== "cancelled",
    };
  });
}

/** A project's task counts (`projects.getTaskProgress` and `listTaskProgress`). */
export type ProjectTaskProgress = Record<DisplayTaskStatus, number> & {
  total: number;
};

/**
 * The progress bar's coloured parts, in workflow order: each non-empty
 * status's share of the tasks and where it starts, both from 0 to 1.
 */
export function projectProgressSegments(
  progress: ProjectTaskProgress,
): Array<{ status: DisplayTaskStatus; ratio: number; offset: number }> {
  if (progress.total === 0) return [];
  const segments: Array<{
    status: DisplayTaskStatus;
    ratio: number;
    offset: number;
  }> = [];
  let offset = 0;
  for (const status of TASK_STATUSES) {
    const count = progress[status];
    if (count === 0) continue;
    const ratio = count / progress.total;
    segments.push({ status, ratio, offset });
    offset += ratio;
  }
  return segments;
}

/**
 * Why "Create Project" is off, or undefined when it can run: a project needs
 * a title and a description.
 */
export function newProjectSubmitBlocker(
  isLoading: boolean,
  title: string,
  description: string,
): string | undefined {
  if (isLoading) return "Creating project…";
  const missingTitle = !title.trim();
  const missingDescription = !description.trim();
  if (missingTitle && missingDescription)
    return "Enter a project title and description";
  if (missingTitle) return "Enter a project title";
  if (missingDescription) return "Enter a description";
  return undefined;
}
