"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id, type SandboxOwner } from "@eva/backend";
import { IconArrowsDiagonal, IconX } from "@tabler/icons-react";
import {
  Button,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { TaskSandboxChatPanel, useTaskChatBinding } from "@/lib/components/tasks/TaskSandboxChatPanel";
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
import type { ProjectTaskTab } from "./projectSandboxTabs";

/** The task's own chat and sandbox, as on its full page. */
const PROJECT_TASK_ROUTING: UseTaskDetailRouting = { mode: "project-task" };

/** The sandbox pane each task tab shows; Chat is not a sandbox pane. */
const PANE_TAB: Record<ProjectTaskTab, "preview" | "browser" | "review" | null> =
  {
    "task-chat": null,
    "task-preview": "preview",
    "task-browser": "browser",
    "task-review": "review",
  };

/**
 * A project task opened in the coordinator's panel (`?task=`): a header with
 * its number and title, Expand (its full page) and ✕, then its own chat and
 * its Preview, Browser and Review panes. An archived task is read-only, as on
 * its full page. Files, Agents and the terminal live on the full page:
 * opening them from the chat expands to it.
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
  onClose,
}: {
  taskId: Id<"agentTasks">;
  numId: number | undefined;
  title: string;
  /** The task's own PR; Review shows only with one. */
  prUrl: string | undefined;
  /** The active task tab; null while a coordinator tab is active. */
  tab: ProjectTaskTab | null;
  /** The task's full page (pre-internal form). */
  fullPageHref: string;
  collapsed: boolean;
  onSelectTab: (tab: ProjectTaskTab) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const detail = useTaskDetail(taskId, PROJECT_TASK_ROUTING);
  const paneTab = tab === null ? null : PANE_TAB[tab];
  // Mount the sandbox panes on the first visit to one of their tabs, then
  // keep them while this task stays open (the parent keys it by task).
  const [panesVisited, setPanesVisited] = useState(paneTab !== null);
  if (paneTab !== null && !panesVisited) setPanesVisited(true);

  const expand = (search: Record<string, string> = {}) =>
    void navigate({ to: toInternalRepoHref(fullPageHref), search });
  const openDiffs = () => {
    if (prUrl !== undefined) onSelectTab("task-review");
    else expand();
  };

  const {
    task,
    isArchived,
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    handleStartSandbox,
    handleStopSandbox,
    hasActiveRun,
    taskSession,
  } = detail;
  const { sandbox } = taskSession;

  return (
    <div
      className={
        tab === null ? "hidden" : "flex h-full min-h-0 flex-col overflow-hidden"
      }
    >
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
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close task"
          onClick={onClose}
        >
          <IconX className="size-4" />
        </Button>
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
            <KeepAlivePane
              active={tab === "task-chat"}
              className="flex h-full min-h-0 flex-col overflow-hidden"
            >
              <TaskSandboxChatPanel
                taskId={taskId}
                isSandboxActive={isSandboxActive}
                isSandboxToggling={isSandboxStarting || isSandboxStopping}
                sandboxStartupActivity={sandboxStartupActivity}
                onOpenFile={(path) => expand({ file: path })}
                onViewDiff={(path) =>
                  path === undefined ? openDiffs() : expand({ diffFile: path })
                }
                onOpenAgentsTab={() => expand()}
                isArchived={isArchived}
                onSandboxToggle={
                  canStartSandbox || isSandboxActive
                    ? (action) => {
                        if (action === "start") void handleStartSandbox();
                        else void handleStopSandbox();
                      }
                    : undefined
                }
              />
            </KeepAlivePane>
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

/**
 * The task sandbox's Preview, Browser and Review panes, keyed by the task's
 * session as on its full page (same pane storage scope).
 */
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
  /** The pane on screen; null while Chat or a coordinator tab is active. */
  paneTab: "preview" | "browser" | "review" | null;
  prUrl: string | undefined;
  onStartSandbox: (() => void) | undefined;
  isSandboxStarting: boolean;
  autoWakeEligible: boolean;
  /** False while the panel is collapsed. */
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
          // Backend starts the app in the Console tmux session after startup.
          runConsoleDevCommandOnConnect={false}
          onStartSandbox={onStartSandbox}
          isSandboxStarting={isSandboxStarting}
          autoWakeEligible={autoWakeEligible}
          onAnnotationSubmit={submitAnnotation}
          // Only the pane on screen holds the presence beacon or auto-wakes.
          presenceEnabled={visible}
          onScreen={visible}
          // The project task's full page has no mini-player either.
          miniPlayer={undefined}
          viewState={viewState}
        />
      </ReviewChatTargetProvider>
    </div>
  );
}
