/** An agent task's lifecycle (the backend `taskStatusValidator`). */
export type TaskStatus =
  | "draft"
  | "todo"
  | "in_progress"
  | "code_review"
  | "business_review"
  | "done"
  | "cancelled";

/** Statuses a task list shows; drafts live in the new-task drafts menu. */
export type DisplayTaskStatus = Exclude<TaskStatus, "draft">;

/** Workflow order: the kanban columns and the list sections, left to right and top to bottom. */
export const TASK_STATUSES: DisplayTaskStatus[] = [
  "todo",
  "in_progress",
  "business_review",
  "code_review",
  "done",
  "cancelled",
];

/** Each status's name in badges, columns and section headers. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  draft: "Draft",
  todo: "To Do",
  in_progress: "In Progress",
  code_review: "Code Review",
  business_review: "Business Review",
  done: "Merged",
  cancelled: "Cancelled",
};

/**
 * Position of a status in the workflow, for sorting a mixed list into pipeline
 * order (todo → … → done) instead of alphabetically. Statuses outside
 * TASK_STATUSES — only "draft" today — sort after every known one.
 */
export function statusWorkflowOrder(status: TaskStatus): number {
  const index = TASK_STATUSES.findIndex((s) => s === status);
  return index === -1 ? TASK_STATUSES.length : index;
}

/**
 * One section per status in TASK_STATUSES order, empty ones included, each
 * keeping the input order of its tasks. Drafts are left out.
 */
export function groupByTaskStatus<T extends { status: TaskStatus }>(
  tasks: readonly T[],
): Array<{ status: DisplayTaskStatus; tasks: T[] }> {
  return TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));
}

/**
 * The Quick Tasks list as the web opens it with no filters set: tasks outside
 * any project, most recently updated first, in status sections.
 */
export function defaultQuickTaskSections<
  T extends { status: TaskStatus; projectId?: string; updatedAt: number },
>(tasks: readonly T[]): Array<{ status: DisplayTaskStatus; tasks: T[] }> {
  // `filter` copies, so `sort` mutates nothing shared; `toSorted` is missing
  // in some Hermes release builds (see `notificationGroups.ts`).
  return groupByTaskStatus(
    tasks
      .filter((task) => task.projectId === undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

/** "#12", or "#3/12" inside project 3; null without a number. */
export function formatEntityNumLabel(options: {
  numId?: number;
  projectNumId?: number;
}): string | null {
  const { numId, projectNumId } = options;
  if (numId === undefined) return null;
  return projectNumId !== undefined ? `#${projectNumId}/${numId}` : `#${numId}`;
}

/** A task's priority (the backend `priorityValidator`). */
export type Priority = "urgent" | "high" | "medium" | "low";

/** Most urgent first: the priority picker's order. */
export const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Ascending: no priority, then low up to urgent. */
export function priorityCompare(
  a: Priority | undefined,
  b: Priority | undefined,
): number {
  const ra = a === undefined ? 0 : PRIORITY_RANK[a];
  const rb = b === undefined ? 0 : PRIORITY_RANK[b];
  return ra - rb;
}
