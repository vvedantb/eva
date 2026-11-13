import type { Doc } from "@eva/backend";
import { z } from "zod";
import { TASK_STATUSES, priorityCompare, type DisplayTaskStatus, type Priority, type TaskStatus } from "./taskMeta";

/** A project's lifecycle (the backend `projects.phase`). */
export type ProjectPhase = Doc<"projects">["phase"];

/** Each phase's name in badges, list sections and menus. */
export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  draft: "Draft",
  finalized: "Finalized",
  in_progress: "In Progress",
  business_review: "Business Review",
  code_review: "Code Review",
  completed: "Merged",
  cancelled: "Cancelled",
};

/**
 * Phases a user can switch to in the status picker. Draft and finalized are
 * left out: the planning interview drives those.
 */
export const ACTIVE_PROJECT_PHASES: ProjectPhase[] = [
  "in_progress",
  "business_review",
  "code_review",
  "completed",
  "cancelled",
];

/** Phases where the autonomous "Build Project" workflow can start. */
export const BUILDABLE_PROJECT_PHASES: ProjectPhase[] = ["in_progress", "business_review", "code_review"];

/** Draft and finalized projects show the plan (interview and spec) in place of tasks. */
export function isProjectPlanning(phase: ProjectPhase): boolean {
  return phase === "draft" || phase === "finalized";
}

export const PROJECT_SORT_FIELDS = ["created", "title", "priority"] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];
export type ProjectSortDir = "asc" | "desc";

export const PROJECT_SORT_FIELD_LABELS: Record<ProjectSortField, string> = {
  created: "Date Created",
  title: "Title",
  priority: "Priority",
};

/** Search, phase filter and sort of the projects list. `hiddenPhases` is a blocklist, so a new phase shows by default. */
export interface ProjectListFilters {
  q: string;
  hiddenPhases: ProjectPhase[];
  sortField: ProjectSortField;
  sortDir: ProjectSortDir;
}

export const PROJECT_LIST_DEFAULTS: ProjectListFilters = {
  q: "",
  hiddenPhases: [],
  sortField: "created",
  sortDir: "desc",
};

/** The fields `filterAndSortProjects` reads from a `projects.list` row. */
export interface FilterableProject {
  title: string;
  rawInput?: string;
  description?: string;
  phase: ProjectPhase;
  priority?: Priority;
  _creationTime: number;
}

/**
 * The projects the list shows: visible phases only, matching the search in
 * the title, raw input or description, then sorted by the sort field.
 */
export function filterAndSortProjects<T extends FilterableProject>(
  projects: readonly T[],
  filters: Pick<ProjectListFilters, "q" | "hiddenPhases" | "sortField" | "sortDir">,
): T[] {
  const query = filters.q.toLowerCase().trim();
  const hidden = new Set<ProjectPhase>(filters.hiddenPhases);
  return projects
    .filter((project) => {
      if (hidden.has(project.phase)) return false;
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
 * Shows or hides one phase in the list. The last visible phase stays: the
 * list never hides every phase.
 */
export function toggleHiddenProjectPhase(
  hiddenPhases: readonly ProjectPhase[],
  phase: ProjectPhase,
  allPhases: readonly ProjectPhase[],
): ProjectPhase[] {
  if (hiddenPhases.includes(phase)) return hiddenPhases.filter((hidden) => hidden !== phase);
  const visibleCount = allPhases.filter((candidate) => !hiddenPhases.includes(candidate)).length;
  if (visibleCount <= 1) return [...hiddenPhases];
  return [...hiddenPhases, phase];
}

export type ProjectFilterKey = "phases" | "sortField" | "sortDir";

/** The "Filtered by" chips, in order: the phase count, a non-default sort field, ascending. */
export function projectFilterChips(
  filters: ProjectListFilters,
  allPhases: readonly ProjectPhase[],
): Array<{ key: ProjectFilterKey; label: string }> {
  const chips: Array<{ key: ProjectFilterKey; label: string }> = [];
  if (filters.hiddenPhases.length > 0) {
    const visible = allPhases.filter((phase) => !filters.hiddenPhases.includes(phase)).length;
    chips.push({ key: "phases", label: `${visible} Phase${visible !== 1 ? "s" : ""}` });
  }
  if (filters.sortField !== "created") {
    chips.push({ key: "sortField", label: `Sort: ${PROJECT_SORT_FIELD_LABELS[filters.sortField]}` });
  }
  if (filters.sortDir !== "desc") chips.push({ key: "sortDir", label: "Ascending" });
  return chips;
}

/** The filters with one chip's filter back at its default. */
export function clearedProjectFilter(key: ProjectFilterKey): Partial<ProjectListFilters> {
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
export function clearedProjectFilters(): Partial<ProjectListFilters> {
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
    const sorted = status === "todo" ? matching : matching.sort((a, b) => lastRun(b) - lastRun(a));
    return {
      status,
      tasks: sorted,
      defaultOpen: sorted.length > 0 && status !== "done" && status !== "cancelled",
    };
  });
}

/** A project's task counts (`projects.getTaskProgress` and `listTaskProgress`). */
export type ProjectTaskProgress = Record<DisplayTaskStatus, number> & { total: number };

/**
 * The progress bar's coloured parts, in workflow order: each non-empty
 * status's share of the tasks and where it starts, both from 0 to 1.
 */
export function projectProgressSegments(
  progress: ProjectTaskProgress,
): Array<{ status: DisplayTaskStatus; ratio: number; offset: number }> {
  if (progress.total === 0) return [];
  const segments: Array<{ status: DisplayTaskStatus; ratio: number; offset: number }> = [];
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
export function newProjectSubmitBlocker(isLoading: boolean, title: string, description: string): string | undefined {
  if (isLoading) return "Creating project…";
  const missingTitle = !title.trim();
  const missingDescription = !description.trim();
  if (missingTitle && missingDescription) return "Enter a project title and description";
  if (missingTitle) return "Enter a project title";
  if (missingDescription) return "Enter a description";
  return undefined;
}

const projectSpecSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  tasks: z
    .array(
      z.object({
        title: z.string().nullish(),
        description: z.string().nullish(),
        dependencies: z.array(z.number()).nullish(),
      }),
    )
    .nullish(),
});

export interface ProjectSpecTask {
  title: string;
  description: string;
  dependencies: number[];
}

export interface ProjectSpec {
  title: string;
  description: string;
  tasks: ProjectSpecTask[];
}

/** A project's generated plan (`generatedSpec`, JSON), or null when it is not valid JSON of the plan shape. */
export function parseProjectSpec(specJson: string): ProjectSpec | null {
  const parsed = (() => {
    try {
      return projectSpecSchema.safeParse(JSON.parse(specJson));
    } catch {
      return null;
    }
  })();
  if (!parsed?.success) return null;
  return {
    title: parsed.data.title ?? "",
    description: parsed.data.description ?? "",
    tasks: (parsed.data.tasks ?? []).map((task) => ({
      title: task.title ?? "",
      description: task.description ?? "",
      dependencies: task.dependencies ?? [],
    })),
  };
}

const interviewQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.object({ label: z.string(), description: z.string() })),
});
const interviewTransitionSchema = z.union([
  z.object({ interviewComplete: z.literal(true) }),
  z.object({ ready: z.literal(true) }),
]);
const specSummarySchema = z.object({ title: z.string(), tasks: z.array(z.object({}).passthrough()) });

/**
 * What one planning-interview turn says, as the web `ProjectChatMessageList`
 * shows it: a question's text, "Plan ready: <title> (N tasks)" for a plan,
 * nothing for the hand-off to planning or an empty turn, else the text as
 * written.
 */
export function interviewTurnText(content: string): string | null {
  if (!content.trim()) return null;
  const json = (() => {
    try {
      return { value: JSON.parse(content) };
    } catch {
      return null;
    }
  })();
  if (!json) return content;
  const question = interviewQuestionSchema.safeParse(json.value);
  if (question.success) return question.data.question;
  if (interviewTransitionSchema.safeParse(json.value).success) return null;
  const spec = specSummarySchema.safeParse(json.value);
  if (spec.success) {
    const count = spec.data.tasks.length;
    return `Plan ready: ${spec.data.title} (${count} ${count === 1 ? "task" : "tasks"})`;
  }
  return content;
}
