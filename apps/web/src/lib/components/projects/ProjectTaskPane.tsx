"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id, type SandboxOwner } from "@eva/backend";
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
import type { UseTaskDetailRouting } from "@/lib/components/tasks/useTaskDetailControls";
import { KeepAlivePane } from "@/lib/components/sandbox/KeepAlivePane";
import { SandboxPaneSlots } from "@/lib/components/sandbox/SandboxPaneSlots";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import { useSandboxPanes } from "@/lib/components/sandbox/useSandboxPanes";
import { useSandboxPreview } from "@/lib/components/sandbox/useSandboxPreview";
import type { OwnedSandboxFields } from "@/lib/components/sandbox/useOwnedSession";
import { useSandboxAnnotationSend } from "@/lib/components/chat/sandboxChatBinding";
import { sandboxChatKeys } from "@/lib/components/chat/sandboxChatTurn";
import { ReviewChatTargetProvider } from "@/lib/contexts/ReviewChatTargetContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { TaskDetailsPane } from "@/lib/components/tasks/TaskDetailsPane";
import type { ProjectTaskTab } from "./projectSandboxTabs";

/** The task's own chat and sandbox, as on its full page. */
export const PROJECT_TASK_ROUTING: UseTaskDetailRouting = {
  mode: "project-task",
};

const PANE_TAB: Record<ProjectTaskTab, "preview" | "browser" | "review" | null> =
  {
    "task-details": null,
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
 * The selected task tab's panel: a header with its number and title and
 * Expand (its full page), then its Details (the quick task's overview) and
 * its Preview, Browser and Review panes. Its chat is in the chat column
 * (`ProjectTaskChat`). An archived task is read-only, as on its full page.
 */
export function ProjectTaskPane({
  taskId,
  numId,
  title,
  prUrl,
  tab,
  fullPageHref,
  collapsed,
  onSelectTab,
}: {
  taskId: Id<"agentTasks">;
  numId: number | undefined;
  title: string;
  prUrl: string | undefined;
  tab: ProjectTaskTab;
  fullPageHref: string;
  collapsed: boolean;
  onSelectTab: (tab: ProjectTaskTab) => void;
}) {
  const detail = useTaskDetail(taskId, PROJECT_TASK_ROUTING);
  const paneTab = PANE_TAB[tab];
  const [panesVisited, setPanesVisited] = useState(paneTab !== null);
  if (paneTab !== null && !panesVisited) setPanesVisited(true);
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
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <EntityNumLabel numId={numId} className="text-xs" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </span>
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
            {task ? (
              <KeepAlivePane
                active={tab === "task-details"}
                className="flex h-full min-h-0 flex-col overflow-hidden"
              >
                <TaskDetailsPane
                  taskId={taskId}
                  task={task}
                  detail={detail}
                  showHeader={false}
                />
              </KeepAlivePane>
            ) : null}
            {sandbox.owner && task?.repoId && panesVisited ? (
              <ProjectTaskSandboxPanes
                taskId={taskId}
                owner={sandbox.owner}
                sandbox={sandbox}
                repoId={task.repoId}
                isActive={isSandboxActive}
                paneTab={paneTab}
                prUrl={prUrl}
                onStartSandbox={
                  canStartSandbox && !isSandboxStopping
                    ? handleStartSandbox
                    : undefined
                }
                isSandboxStarting={isSandboxStarting}
                autoWakeEligible={
                  sandbox.status === "closed" &&
                  sandbox.sandboxId !== undefined &&
                  canStartSandbox &&
                  !hasActiveRun
                }
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
  paneTab: "preview" | "browser" | "review" | null;
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
  const submitAnnotation = useSandboxAnnotationSend(chatBinding);
  const chatKeys = sandboxChatKeys(chatBinding.entity);
  const viewState = useQuery(api.sandboxPanes.getViewState, { owner });
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);
  const preview = useSandboxPreview({
    owner,
    sandboxId: sandbox.sandboxId,
    isActive,
    isRouteActive: paneTab !== null,
    repoId,
    devPort: sandbox.devPort,
  });
  const visible = paneTab !== null && onScreen;

  return (
    <div className={paneTab === null ? "hidden" : "h-full overflow-hidden"}>
      <ReviewChatTargetProvider value={chatKeys.draftTarget ?? null}>
        <SandboxPaneSlots
          activeTab={paneTab ?? "none"}
          panes={panes}
          preview={preview}
          owner={owner}
          sandboxId={sandbox.sandboxId}
          isActive={isActive}
          repoId={repoId}
          cacheKey={String(taskId)}
          devCommand={sandbox.devCommand}
          prUrl={prUrl}
          agentBrowsingAt={viewState?.agentBrowsingAt}
          onReleaseBrowserLock={() => void releaseBrowserLock({ owner })}
          runConsoleDevCommandOnConnect={false}
          onStartSandbox={onStartSandbox}
          isSandboxStarting={isSandboxStarting}
          autoWakeEligible={autoWakeEligible}
          onAnnotationSubmit={submitAnnotation}
          presenceEnabled={visible}
          onScreen={visible}
          miniPlayer={undefined}
          viewState={viewState}
        />
      </ReviewChatTargetProvider>
    </div>
  );
}
