import {
  isTaskRouteSandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";

/**
 * The coordinator rail's tabs: the project's Tasks first, then the sandbox
 * tabs every owner shares. Tasks is project-only, so it is not a `SandboxTab`.
 * Replies (an open reply thread, `?thread=`) shows only while a thread is open.
 */
export type ProjectSandboxTab = "tasks" | "replies" | TaskRouteSandboxTab;

/** The coordinator's default tab: the project opens on its tasks. */
export const PROJECT_DEFAULT_SANDBOX_TAB = "tasks" satisfies ProjectSandboxTab;

export function isProjectSandboxTab(value: string): value is ProjectSandboxTab {
  return (
    value === "tasks" || value === "replies" || isTaskRouteSandboxTab(value)
  );
}
