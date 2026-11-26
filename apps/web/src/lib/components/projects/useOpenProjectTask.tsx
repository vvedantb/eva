"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useQueryState } from "nuqs";
import { api, type Id } from "@eva/backend";
import {
  IconBrowser,
  IconGitPullRequest,
  IconMessage,
  IconMessageFilled,
  IconWorld,
  IconWorldFilled,
} from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vvedantb/ui";
import { formatEntityNumLabel } from "@eva/shared";
import { projectPanelTaskParser } from "@/lib/search-params";
import type { SandboxTabDescriptor } from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabTrigger";
import {
  visibleProjectTaskTabs,
  type ProjectSandboxTab,
  type ProjectTaskTab,
} from "./projectSandboxTabs";
import type { ProjectTaskListRow } from "./useProjectStatus";

/** The open task's rail tabs: the same icons as the sandbox tabs they show. */
const TASK_TAB_DESCRIPTORS: Record<ProjectTaskTab, SandboxTabDescriptor> = {
  "task-chat": {
    value: "task-chat",
    label: "Chat",
    icon: { kind: "component", Icon: IconMessage, ActiveIcon: IconMessageFilled },
  },
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

/**
 * The task open in the project's panel (`?task=<numId>`): its row (from the
 * lists the Tasks tab already loads, archived ones too), the rail group (a
 * `#904` chip, then the tabs that have content) and the tab to show for a
 * task tab in the URL. A task not in this project, or one the reader cannot
 * open, is not open: its tabs land on Tasks.
 */
export function useOpenProjectTask(
  projectId: Id<"projects">,
  tasks: ReadonlyArray<ProjectTaskListRow> | undefined,
) {
  const [taskNumId] = useQueryState("task", projectPanelTaskParser);
  const archivedTasks = useQuery(
    api.agentTasks.listByProject,
    taskNumId === null ? "skip" : { projectId, archived: true },
  );
  const loading =
    taskNumId !== null && (tasks === undefined || archivedTasks === undefined);
  const row =
    taskNumId === null
      ? undefined
      : [...(tasks ?? []), ...(archivedTasks ?? [])].find(
          (task) => task.numId === taskNumId && task.locked !== true,
        );
  const tabs = row ? visibleProjectTaskTabs(row) : [];

  // A tab without content (the sandbox stopped) falls back to Chat.
  const resolveTab = (tab: ProjectTaskTab): ProjectSandboxTab => {
    if (row) return tabs.includes(tab) ? tab : "task-chat";
    return loading ? tab : "tasks";
  };

  const railGroup = row
    ? {
        header: <ProjectTaskRailChip numId={row.numId} title={row.title} />,
        tabs: tabs.map((tab) => TASK_TAB_DESCRIPTORS[tab]),
      }
    : undefined;

  return { row, resolveTab, railGroup };
}

/** The open task's `#904` on the rail; its title shows on hover. */
function ProjectTaskRailChip({
  numId,
  title,
}: {
  numId: number | undefined;
  title: string;
}) {
  const label = formatEntityNumLabel({ numId });
  if (!label) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="max-w-full shrink-0 self-center truncate rounded-control bg-accent-soft px-1 py-0.5 font-mono text-3xs tabular-nums text-accent-soft-foreground">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
