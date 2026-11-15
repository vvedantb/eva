export const NO_PROJECT_VALUE = "__none__";
export const NEW_PROJECT_VALUE = "__new_project__";
export const UNASSIGNED_VALUE = "__unassigned__";
export const NO_PRIORITY_VALUE = "__no_priority__";

export const DEPLOYMENT_STATUS_CONFIG: Record<
  string,
  { iconColor: string; label: string }
> = {
  deployed: { iconColor: "text-emerald-500", label: "Deployed" },
  building: { iconColor: "text-amber-500", label: "Building" },
  error: { iconColor: "text-red-500", label: "Deploy failed" },
  queued: { iconColor: "text-blue-500", label: "Queued" },
};

export type TaskDetailTab = "activity";

const TASK_DETAIL_TABS = ["activity"] as const;

export function isTaskDetailTab(v: string): v is TaskDetailTab {
  return TASK_DETAIL_TABS.some((tab) => tab === v);
}

/**
 * Segmented-tab styling, still used by the marketing landing mock
 * (`LandingTaskDetailMock`). `tabs-segmented` (globals.css) drives the trough +
 * active-pill fills; inactive labels use muted-foreground so they read dimmed.
 */
export const TASK_DETAIL_TAB_LIST_CLASS =
  "sticky top-0 z-10 h-auto w-fit gap-0.5 p-1 shadow-none tabs-segmented";

export const TASK_DETAIL_TAB_TRIGGER_CLASS =
  "gap-1 px-3 py-1.5 text-xs font-medium sm:gap-1.5 sm:text-sm transition-[color,background-color] data-[state=active]:text-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground";
