import {
  isTaskRouteSandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";

/**
 * The panel tabs of the selected task tab (`?task=`), in rail order. Its chat
 * is in the chat column. Prefixed so they never clash with the coordinator's
 * own tabs.
 */
const PROJECT_TASK_TABS = [
  "task-details",
  "task-preview",
  "task-browser",
  "task-review",
] as const;
export type ProjectTaskTab = (typeof PROJECT_TASK_TABS)[number];

export function isProjectTaskTab(value: string): value is ProjectTaskTab {
  return PROJECT_TASK_TABS.some((tab) => tab === value);
}

/**
 * A project task's full page opens on Details while the task is still in To
 * Do (added and never started, or sent back after a run), else on its chat.
 * The status is the fact every row carries; run summaries can outlive their
 * runs.
 */
export function projectTaskOpensOnDetails(task: { status: string }): boolean {
  return task.status === "todo" || task.status === "draft";
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
 * The selected task's tabs that have content: Details always; Preview and
 * Browser while its sandbox runs; Review once it has a PR.
 */
export function visibleProjectTaskTabs(task: {
  sandboxStatus?: string;
  prUrl?: string;
}): ProjectTaskTab[] {
  const running = task.sandboxStatus === "active";
  return PROJECT_TASK_TABS.filter((tab) => {
    if (tab === "task-preview" || tab === "task-browser") return running;
    if (tab === "task-review") return task.prUrl !== undefined;
    return true;
  });
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
