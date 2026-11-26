"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import { api, type Id } from "@eva/backend";
import { projectTaskView } from "@eva/shared/projectView";
import {
  IconBrowser,
  IconGitPullRequest,
  IconWorld,
  IconWorldFilled,
} from "@tabler/icons-react";
import {
  projectPanelTaskParser,
  projectTaskTabsParser,
} from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { requestComposerFocus } from "@/lib/components/chat/composerFocusRequest";
import type { SandboxTabDescriptor } from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabTrigger";
import {
  isProjectTaskTab,
  PROJECT_DEFAULT_SANDBOX_TAB,
  projectTaskTabList,
  type ProjectSandboxTab,
  type ProjectTaskTab,
} from "./projectSandboxTabs";
import {
  useProjectTaskStatus,
  type ProjectTaskListRow,
} from "./useProjectStatus";

/** The selected task's rail tabs: the same icons as the sandbox tabs they show. */
const TASK_TAB_DESCRIPTORS: {
  [Tab in ProjectTaskTab]: SandboxTabDescriptor & { value: Tab };
} = {
  "task-preview": {
    value: "task-preview",
    label: "Preview",
    icon: { kind: "component", Icon: IconWorld, ActiveIcon: IconWorldFilled },
  },
  "task-browser": {
    value: "task-browser",
    label: "Browser",
    icon: { kind: "component", Icon: IconBrowser },
  },
  "task-review": {
    value: "task-review",
    label: "Review",
    icon: { kind: "component", Icon: IconGitPullRequest },
  },
};

/** The rail descriptors of the selected task's tabs. */
export function projectTaskRailTabs(tabs: ReadonlyArray<ProjectTaskTab>) {
  return tabs.map((tab) => TASK_TAB_DESCRIPTORS[tab]);
}

/**
 * `?tasks=` for the router. The router writes a string that parses as JSON
 * (a lone `"903"`) in quotes, so one tab goes as a number.
 */
function tasksSearchValue(list: ReadonlyArray<number>) {
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : list.join(",");
}

export interface ProjectTaskTabs {
  /** The open task tabs' numIds, in tab order. */
  numIds: number[];
  /** The selected task tab's numId; null while Eva's tab is selected. */
  selected: number | null;
  /** Opens a task as a tab (or selects its tab), on its default panel tab. */
  open: (numId: number) => void;
  /** Selects a task tab on its default panel tab, or Eva's tab (null). */
  select: (numId: number | null) => void;
  /** ✕ on a task tab; the selected one hands over to the tab on its left. */
  close: (numId: number) => void;
  /** Shows one of the selected task's panel tabs. */
  showTab: (tab: ProjectTaskTab) => void;
  /**
   * The project's "+" (New task): Eva's tab with her composer focused. Work
   * goes in through her chat; she starts it or adds it to an open task.
   */
  askEva: () => void;
}

/**
 * The project's chat tabs, in the URL: `?tasks=` (the open task tabs) and
 * `?task=` (the selected one; absent = Eva). The panel tab is the path
 * segment: a task tab opens on the coordinator's default tab, which the panel
 * reads as the task's default (`defaultProjectTaskTab`); Eva's tab returns
 * to the coordinator tab it left.
 */
export function useProjectTaskTabs({
  basePath,
  projectPathSegment,
  sandboxTab,
  onShowPanel,
}: {
  basePath: string;
  projectPathSegment: string | null;
  /** The panel tab in the URL now. */
  sandboxTab: ProjectSandboxTab;
  /** Expands a collapsed panel. */
  onShowPanel: () => void;
}): ProjectTaskTabs {
  const navigate = useNavigate();
  const [params, setParams] = useQueryStates({
    tasks: projectTaskTabsParser,
    task: projectPanelTaskParser,
  });
  const selected = params.task;
  const numIds = projectTaskTabList(params.tasks, selected);
  // The coordinator tab Eva's tab returns to.
  const [coordinatorTab, setCoordinatorTab] = useState<ProjectSandboxTab>(
    PROJECT_DEFAULT_SANDBOX_TAB,
  );

  const go = async (
    list: ReadonlyArray<number>,
    next: number | null,
    replace = false,
  ) => {
    if (!projectPathSegment) return;
    if (selected === null && !isProjectTaskTab(sandboxTab)) {
      setCoordinatorTab(sandboxTab);
    }
    const tab = next === null ? coordinatorTab : PROJECT_DEFAULT_SANDBOX_TAB;
    await navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/${tab}`,
      ),
      search: (prev) => ({
        ...prev,
        tasks: tasksSearchValue(list),
        task: next ?? undefined,
      }),
      replace,
    });
  };

  const open = (numId: number) => {
    void go(projectTaskTabList([...numIds, numId], numId), numId);
    onShowPanel();
  };

  const select = (numId: number | null) => {
    if (numId === selected) return;
    void go(numIds, numId);
  };

  const askEva = () => {
    if (selected === null) {
      requestComposerFocus();
      return;
    }
    void go(numIds, null).then(requestComposerFocus);
  };

  const close = (numId: number) => {
    const rest = numIds.filter((id) => id !== numId);
    if (numId !== selected) {
      void setParams({ tasks: rest }, { history: "replace" });
      return;
    }
    const index = numIds.indexOf(numId);
    void go(rest, index > 0 ? numIds[index - 1] : null, true);
  };

  const showTab = (tab: ProjectTaskTab) => {
    if (!projectPathSegment) return;
    void navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/sandbox/${tab}`,
      ),
      search: true,
    });
    onShowPanel();
  };

  return { numIds, selected, open, select, close, showTab, askEva };
}

/** One task tab: its row and whether the task works now. */
export interface ProjectTaskTabRow {
  numId: number;
  row: ProjectTaskListRow;
  /** The Tasks list's Working: the tab shows the running mark. */
  running: boolean;
}

/**
 * The open task tabs' rows, from the lists the Tasks tab already loads
 * (archived ones too). A task not in this project, or one the reader cannot
 * open, has no tab.
 */
export function useProjectTaskTabRows(
  projectId: Id<"projects">,
  repoId: Id<"githubRepos">,
  tabs: Pick<ProjectTaskTabs, "numIds" | "selected">,
) {
  const { tasks, failedTaskIds } = useProjectTaskStatus(projectId, repoId);
  const archivedTasks = useQuery(
    api.agentTasks.listByProject,
    tabs.numIds.length === 0 ? "skip" : { projectId, archived: true },
  );
  const loading =
    tabs.numIds.length > 0 &&
    (tasks === undefined || archivedTasks === undefined);
  const working = new Set(
    (tasks ?? [])
      .filter(
        (row) =>
          projectTaskView(row, failedTaskIds.has(row._id)).displayStatus ===
          "working",
      )
      .map((row) => row._id),
  );
  const byNumId = new Map<number, ProjectTaskListRow>();
  for (const row of [...(tasks ?? []), ...(archivedTasks ?? [])]) {
    if (row.numId !== undefined && row.locked !== true) {
      byNumId.set(row.numId, row);
    }
  }
  const rows: ProjectTaskTabRow[] = tabs.numIds.flatMap((numId) => {
    const row = byNumId.get(numId);
    return row ? [{ numId, row, running: working.has(row._id) }] : [];
  });
  return {
    rows,
    /** The selected task tab's row; undefined on Eva's tab. */
    selectedRow:
      tabs.selected === null ? undefined : byNumId.get(tabs.selected),
    /** The selected task's row is still loading: not Eva's tab yet. */
    selectedLoading: tabs.selected !== null && loading,
  };
}
