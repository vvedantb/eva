import {
  isTaskRouteSandboxTab,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";

/**
 * The coordinator rail's tabs: the project's Tasks first, then the sandbox
 * tabs every owner shares. Tasks is project-only, so it is not a `SandboxTab`.
 */
export type ProjectSandboxTab = "tasks" | TaskRouteSandboxTab;

/** The coordinator's default tab: the project opens on its tasks. */
export const PROJECT_DEFAULT_SANDBOX_TAB = "tasks" satisfies ProjectSandboxTab;

export function isProjectSandboxTab(value: string): value is ProjectSandboxTab {
  return value === "tasks" || isTaskRouteSandboxTab(value);
}
