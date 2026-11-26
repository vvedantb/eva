"use client";

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
import { PROJECT_TASK_ROUTING } from "@/lib/components/tasks/useTaskDetailControls";
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
import { ProjectTaskFacts } from "./ProjectTaskFacts";
import type { ProjectTaskListRow } from "./useProjectStatus";

/** The sandbox pane each task tab shows. */
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
  /** The task's full page (pre-internal form). */
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
  /** The task's row in the project's task list. */
  row: ProjectTaskListRow;
  tab: ProjectTaskTab;
  /** The task's full page (pre-internal form). */
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
  /** The pane on screen. */
  paneTab: "preview" | "browser" | "review";
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
  const annotationTarget = useSandboxAnnotationSend(chatBinding);
  const chatKeys = sandboxChatKeys(chatBinding.entity);
  const viewState = useQuery(api.sandboxPanes.getViewState, { owner });
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);
  const preview = useSandboxPreview({
    owner,
    sandboxId: sandbox.sandboxId,
    isActive,
    repoId,
    devPort: sandbox.devPort,
  });

  return (
    <div className="h-full overflow-hidden">
      <ReviewChatTargetProvider value={chatKeys.draftTarget ?? null}>
        <SandboxPaneSlots
          activeTab={paneTab}
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
          annotation={annotationTarget}
          // Only the pane on screen holds the presence beacon or auto-wakes.
          presenceEnabled={onScreen}
          onScreen={onScreen}
          // The project task's full page has no mini-player either.
          miniPlayer={undefined}
          viewState={viewState}
        />
      </ReviewChatTargetProvider>
    </div>
  );
}
