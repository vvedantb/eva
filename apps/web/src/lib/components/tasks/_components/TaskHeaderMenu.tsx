"use client";

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Doc } from "@eva/backend";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import { IconDots } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { usePrLinkMenuItems } from "@/lib/components/PrLinkMenuItems";
import { TaskCardMenuItems } from "@/lib/components/quick-tasks/_components/TaskCardMenuItems";
import { useTaskMenu } from "@/lib/components/quick-tasks/_components/useTaskMenu";
import {
  TaskSandboxMenuItems,
  type TaskSandboxMenuItemsProps,
} from "./TaskFooterMoreMenu";

interface TaskHeaderMenuProps extends TaskSandboxMenuItemsProps {
  task: Doc<"agentTasks">;
  buttonSize: "default" | "sm";
  iconSize: number;
  createPr: { enabled: boolean; isCreating: boolean; onCreate: () => void };
}

/**
 * The quick task header "…" menu: the task card's menu (`TaskCardMenuItems`)
 * with the sandbox commands and Create PR above it, which need the open task.
 */
export function TaskHeaderMenu({
  task,
  buttonSize,
  iconSize,
  createPr,
  ...sandboxItems
}: TaskHeaderMenuProps) {
  const { basePath } = useRepo();
  const navigate = useNavigate();
  const users = useQuery(api.users.listAll);
  const currentUserId = useQuery(api.auth.me);
  const projects = useQuery(
    api.projects.list,
    task.repoId ? { repoId: task.repoId } : "skip",
  );
  const groupedCodebases = useQuery(api.githubRepos.listGroupedByCodebase);
  // Create PR only: the task's PR rows come from `TaskCardMenuItems`.
  const createPrItem = usePrLinkMenuItems({
    createPr,
    prUrl: undefined,
    hasDeployment: false,
  });
  const segment = entityPathSegment(task);
  const tasksPath = `${basePath}/quick-tasks`;
  const { menuProps, dialogs } = useTaskMenu({
    id: task._id,
    title: task.title,
    status: task.status,
    href: segment ? `${tasksPath}/${segment}` : undefined,
    assignedTo: task.assignedTo,
    projectId: task.projectId,
    repoId: task.repoId,
    groupedCodebases: groupedCodebases ?? undefined,
    users: users ?? undefined,
    currentUserId: currentUserId ?? undefined,
    projects: projects ?? undefined,
    // Deleted or moved: this page has nothing left to show.
    onRemoved: () => {
      void navigate({ to: toInternalRepoHref(tasksPath) });
    },
  });
  const { showResolveConflicts, hasSandboxCommandItems } =
    sandboxItems.visibility;
  const hasCommands = showResolveConflicts || hasSandboxCommandItems;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size={buttonSize === "sm" ? "icon-sm" : "icon"}
            aria-label="More"
          >
            <IconDots size={iconSize} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <TaskCardMenuItems
            variant="dropdown"
            {...menuProps}
            leading={
              hasCommands || createPrItem.hasItems ? (
                <>
                  <TaskSandboxMenuItems {...sandboxItems} />
                  {hasCommands && createPrItem.hasItems ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  {createPrItem.items}
                </>
              ) : undefined
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Siblings of the menu: Radix unmounts menu content on close. */}
      {dialogs}
    </>
  );
}
