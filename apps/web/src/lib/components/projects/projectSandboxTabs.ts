import {
  isTaskRouteSandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";

/**
 * The tabs of a task opened in the coordinator's panel (`?task=`), in rail
 * order. Prefixed so they never clash with the coordinator's own tabs.
 */
const PROJECT_TASK_TABS = [
  "task-details",
  "task-chat",
  "task-preview",
  "task-browser",
  "task-review",
] as const;
export type ProjectTaskTab = (typeof PROJECT_TASK_TABS)[number];

export function isProjectTaskTab(value: string): value is ProjectTaskTab {
  return PROJECT_TASK_TABS.some((tab) => tab === value);
}

/**
 * The tab a project task opens on, in the panel and on its full page: a task
 * that has not run, or has no chat yet, opens on Details (its prompt, status
 * and properties); one with a chat from a run opens on Chat. Both facts are
 * checked: a run summary can outlive its run, and a chat alone says nothing
 * ran.
 */
export function defaultProjectTaskTab(task: {
  lastRunStartedAt?: number;
  sessionChatId?: string;
}): "task-details" | "task-chat" {
  return task.lastRunStartedAt === undefined || task.sessionChatId === undefined
    ? "task-details"
    : "task-chat";
}

/**
 * The open task's tabs that have content: Details and Chat always; Preview
 * and Browser while its sandbox runs; Review once it has a PR.
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
 * The coordinator rail's tabs: the project's Tasks first, then the sandbox
 * tabs every owner shares. Tasks is project-only, so it is not a `SandboxTab`.
 * Replies (an open reply thread, `?thread=`) shows only while a thread is
 * open; the task tabs only while a task is open (`?task=`).
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
