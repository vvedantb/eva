"use client";

import { useNavigate } from "@tanstack/react-router";
import { type Id, type SandboxOwner } from "@eva/backend";
import { sandboxAutoWakeEligible } from "@eva/shared";
import { IconArrowsDiagonal } from "@tabler/icons-react";
import {
  Button,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { useTaskChatBinding } from "@/lib/components/tasks/TaskSandboxChatPanel";
import { useTaskDetail } from "@/lib/components/tasks/useTaskDetail";
import { PROJECT_TASK_ROUTING } from "@/lib/components/tasks/useTaskDetailControls";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import { useSandboxPanes } from "@/lib/components/sandbox/useSandboxPanes";
import { useSandboxRail } from "@/lib/components/sandbox/useSandboxRail";
import type { OwnedSandboxFields } from "@/lib/components/sandbox/useOwnedSession";
import { ReviewChatTargetProvider } from "@/lib/contexts/ReviewChatTargetContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { ProjectTaskTab } from "./projectSandboxTabs";
import { ProjectTaskFacts } from "./ProjectTaskFacts";
import type { ProjectTaskListRow } from "./useProjectStatus";

const PANE_TAB: Record<ProjectTaskTab, "preview" | "browser" | "review"> = {
  "task-preview": "preview",
  "task-browser": "browser",
  "task-review": "review",
};

/**
 * What the panel has no room for opens the task's full page: Files
 * (`?file=`), a diff (`?diffFile=`), Agents. Diffs show on Review while the
 * task has a PR.
 */
export function useProjectTaskExpand({
  fullPageHref,
  prUrl,
  onShowReview,
}: {
  fullPageHref: string;
  prUrl: string | undefined;
  onShowReview: () => void;
}) {
  const navigate = useNavigate();
  const expand = (search: Record<string, string> = {}) =>
    void navigate({ to: toInternalRepoHref(fullPageHref), search });
  const openDiffs = () => {
    if (prUrl !== undefined) onShowReview();
    else expand();
  };
  return { expand, openDiffs };
}

/**
 * The selected task tab's panel: a header with its number, title, status and
 * PR line (`ProjectTaskFacts`) and Expand (its full page), then its Preview,
 * Browser and Review panes. Its chat is in the chat column
 * (`ProjectTaskChat`). An archived task is read-only, as on its full page.
 */
export function ProjectTaskPane({
  row,
  tab,
  fullPageHref,
  collapsed,
  onSelectTab,
}: {
  row: ProjectTaskListRow;
  tab: ProjectTaskTab;
  fullPageHref: string;
  collapsed: boolean;
  onSelectTab: (tab: ProjectTaskTab) => void;
}) {
  const { _id: taskId, prUrl } = row;
  const detail = useTaskDetail(taskId, PROJECT_TASK_ROUTING);
  const { expand, openDiffs } = useProjectTaskExpand({
    fullPageHref,
    prUrl,
    onShowReview: () => onSelectTab("task-review"),
  });

  const {
    task,
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    handleStartSandbox,
    hasActiveRun,
    taskSession,
  } = detail;
  const { sandbox } = taskSession;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <EntityNumLabel numId={row.numId} className="text-xs" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {row.title}
            </span>
          </div>
          <ProjectTaskFacts task={row} />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Open full page"
              onClick={() => expand()}
            >
              <IconArrowsDiagonal className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open full page</TooltipContent>
        </Tooltip>
      </div>
      {detail.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : (
        <SandboxSurfaceProviders
          onOpenFile={(path) => expand({ file: path })}
          onOpenDiffsTab={openDiffs}
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            {sandbox.owner && task?.repoId ? (
              <ProjectTaskSandboxPanes
                taskId={taskId}
                owner={sandbox.owner}
                sandbox={sandbox}
                repoId={task.repoId}
                isActive={isSandboxActive}
                paneTab={PANE_TAB[tab]}
                prUrl={prUrl}
                onStartSandbox={
                  canStartSandbox && !isSandboxStopping
                    ? handleStartSandbox
                    : undefined
                }
                isSandboxStarting={isSandboxStarting}
                autoWakeEligible={sandboxAutoWakeEligible({
                  status: sandbox.status,
                  sandboxId: sandbox.sandboxId,
                  sandboxError: sandbox.sandboxError,
                  canStart: canStartSandbox,
                  isBusy: hasActiveRun,
                })}
                onScreen={!collapsed}
              />
            ) : null}
          </div>
        </SandboxSurfaceProviders>
      )}
    </div>
  );
}

function ProjectTaskSandboxPanes({
  taskId,
  owner,
  sandbox,
  repoId,
  isActive,
  paneTab,
  prUrl,
  onStartSandbox,
  isSandboxStarting,
  autoWakeEligible,
  onScreen,
}: {
  taskId: Id<"agentTasks">;
  owner: SandboxOwner;
  sandbox: OwnedSandboxFields;
  repoId: Id<"githubRepos">;
  isActive: boolean;
  paneTab: "preview" | "browser" | "review";
  prUrl: string | undefined;
  onStartSandbox: (() => void) | undefined;
  isSandboxStarting: boolean;
  autoWakeEligible: boolean;
  onScreen: boolean;
}) {
  const panes = useSandboxPanes({
    owner,
    storageScope: `task:${taskId}`,
    isActive,
    terminalPanes: sandbox.terminalPanes,
  });
  const chatBinding = useTaskChatBinding(taskId);
  const rail = useSandboxRail({
    owner,
    sandboxId: sandbox.sandboxId,
    isActive,
    repoId,
    devPort: sandbox.devPort,
    devCommand: sandbox.devCommand,
    binding: chatBinding,
  });

  return (
    <div className="h-full overflow-hidden">
      <ReviewChatTargetProvider value={rail.reviewTarget}>
        <SandboxPaneSlots
          {...rail.paneSlots}
          activeTab={paneTab}
          panes={panes}
          cacheKey={String(taskId)}
          prUrl={prUrl}
          onStartSandbox={onStartSandbox}
          isSandboxStarting={isSandboxStarting}
          autoWakeEligible={autoWakeEligible}
          presenceEnabled={onScreen}
          onScreen={onScreen}
          miniPlayer={undefined}
        />
      </ReviewChatTargetProvider>
    </div>
  );
}
