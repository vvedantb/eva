import {
  isTaskRouteSandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";

const PROJECT_TASK_TABS = [
  "task-preview",
  "task-browser",
  "task-review",
] as const;
export type ProjectTaskTab = (typeof PROJECT_TASK_TABS)[number];

export function isProjectTaskTab(value: string): value is ProjectTaskTab {
  return PROJECT_TASK_TABS.some((tab) => tab === value);
}

/** The most task tabs a project's chat column holds; a 6th closes the oldest. */
export const MAX_PROJECT_TASK_TABS = 5;

/**
 * The project's task tabs, in order: `?tasks=` plus the selected `?task=`
 * when it is not in the list (an old `?task=` link opens that one tab).
 * Repeats go; past the limit the oldest tabs close, never the selected one.
 */
export function projectTaskTabList(
  tasks: ReadonlyArray<number>,
  selected: number | null,
): number[] {
  const unique = [...new Set(tasks)];
  const all =
    selected === null || unique.includes(selected)
      ? unique
      : [...unique, selected];
  const others = all.filter((numId) => numId !== selected);
  const room = MAX_PROJECT_TASK_TABS - (selected === null ? 0 : 1);
  const kept = new Set(others.slice(Math.max(0, others.length - room)));
  return all.filter((numId) => numId === selected || kept.has(numId));
}

/**
 * The selected task's tabs that have content: Preview and Browser while its
 * sandbox runs; Review once it has a PR. A task is its chat, so a task with
 * neither has no tabs.
 */
export function visibleProjectTaskTabs(task: {
  sandboxStatus?: string;
  prUrl?: string;
}): ProjectTaskTab[] {
  const running = task.sandboxStatus === "active";
  return PROJECT_TASK_TABS.filter((tab) =>
    tab === "task-review" ? task.prUrl !== undefined : running,
  );
}

/**
 * The panel tab a selected task shows when the URL names none of its tabs:
 * Review once it has a PR, else Preview while its sandbox runs, else the
 * coordinator's Tasks (a task with no tabs; an old `task-details` link).
 */
export function defaultProjectTaskTab(task: {
  sandboxStatus?: string;
  prUrl?: string;
}): ProjectSandboxTab {
  const tabs = visibleProjectTaskTabs(task);
  if (tabs.includes("task-review")) return "task-review";
  return tabs[0] ?? PROJECT_DEFAULT_SANDBOX_TAB;
}

/**
 * The panel's tabs: the coordinator's (the project's Tasks first, then the
 * sandbox tabs every owner shares; Tasks is project-only, so it is not a
 * `SandboxTab`) and the selected task tab's. Replies (an open reply thread,
 * `?thread=`) shows only while a thread is open.
 */
export type ProjectSandboxTab =
  | "tasks"
  | "replies"
  | ProjectTaskTab
  | TaskRouteSandboxTab;

/** The coordinator's default tab: the project opens on its tasks. */
export const PROJECT_DEFAULT_SANDBOX_TAB = "tasks" satisfies ProjectSandboxTab;

export function isProjectSandboxTab(value: string): value is ProjectSandboxTab {
  return (
    value === "tasks" ||
    value === "replies" ||
    isProjectTaskTab(value) ||
    isTaskRouteSandboxTab(value)
  );
}
