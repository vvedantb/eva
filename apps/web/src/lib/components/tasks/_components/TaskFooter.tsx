"use client";

import { useRef } from "react";
import type { api, Doc, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@eva/ui";
import {
  IconGitPullRequest,
  IconBrandVercel,
  IconHammer,
  IconPlayerPlay,
  IconLoader2,
  IconChevronDown,
  IconCalendarClock,
  IconDots,
  IconRefresh,
  IconServerBolt,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { CopyLinkMenuItem } from "@/lib/components/CopyLinkButton";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { SleepEvaButton } from "@/lib/components/sandbox/SleepEvaButton";
import type { TaskStatus } from "../TaskStatusBadge";
import { SchedulePopover } from "../SchedulePopover";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

type RunDoc = NonNullable<
  FunctionReturnType<typeof api.agentRuns.listByTask>
>[number];

interface TaskFooterProps {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks"> | undefined;
  status: TaskStatus | undefined;
  hasActiveRun: boolean;
  latestPrUrl: string | undefined;
  latestPrError: string | undefined;
  latestDeployment: RunDoc | undefined;
  executionError: string | null;
  isStarting: boolean;
  canStartSandbox: boolean;
  isSandboxActive: boolean;
  isSandboxStopping: boolean;
  isRetryingStartupCommands: boolean;
  isRunningDevServer: boolean;
  isRunningBackgroundCommands: boolean;
  canCreatePr: boolean;
  isCreatingPr: boolean;
  onCreatePr: () => void;
  onStopSandbox: () => void;
  isSandboxViewActive?: boolean;
  onRunStartupCommands: () => void;
  onRunDevServer: () => void;
  onRunBackgroundCommands: () => void;
  onStartExecution: () => void;
  onResolveConfirm: () => void;
  variant?: "footer" | "header";
}

export function TaskFooter({
  taskId,
  task,
  status,
  hasActiveRun,
  latestPrUrl,
  latestPrError,
  latestDeployment,
  executionError,
  isStarting,
  canStartSandbox,
  isSandboxActive,
  isSandboxStopping,
  isRetryingStartupCommands,
  isRunningDevServer,
  isRunningBackgroundCommands,
  canCreatePr,
  isCreatingPr,
  onCreatePr,
  onStopSandbox,
  isSandboxViewActive = false,
  onRunStartupCommands,
  onRunDevServer,
  onRunBackgroundCommands,
  onStartExecution,
  onResolveConfirm,
  variant = "footer",
}: TaskFooterProps) {
  const simpleView = useSimpleView();
  const isHeader = variant === "header";
  const buttonSize = isHeader ? "sm" : "default";
  const iconSize = isHeader ? 16 : 18;
  const showRunButton =
    !task?.projectId &&
    (status === "todo" || (status === "in_progress" && !hasActiveRun));
  // Hidden on the sandbox surface: the chat header there has its own stop
  // control, and two buttons for one action read as a bug.
  const showStopSandbox =
    isSandboxActive && !isSandboxStopping && !isSandboxViewActive;
  // Inert, not hidden, mid-turn — see `SleepEvaButton`. Gated on the chat turn
  // only, not `hasActiveRun`: that also counts *queued* runs, and a task waiting
  // in the queue is no reason to refuse to sleep a sandbox. A main run has its
  // own confirmed Stop; blocking this during one is a separate call.
  const sleepBlockedMidTurn = Boolean(task?.activeChatWorkflowId);
  // Simple view hides the git/sandbox plumbing: conflict resolution, the
  // startup/dev/background command runners, PR creation and links, and the
  // deployment item. The footer menu then has nothing left and drops out
  // entirely; the header menu stays for Copy link.
  const showResolveConflicts =
    !simpleView &&
    !hasActiveRun &&
    (status === "code_review" || status === "business_review");
  const showRunStartupCommands = !simpleView && canStartSandbox;
  const showRunDevServer = !simpleView && isSandboxActive && canStartSandbox;
  const showRunBackgroundCommands =
    !simpleView && isSandboxActive && canStartSandbox;
  const hasSandboxCommandItems =
    showRunStartupCommands || showRunDevServer || showRunBackgroundCommands;
  const showCreatePr = !simpleView && canCreatePr;
  const showViewPr = !simpleView && Boolean(latestPrUrl);
  const showViewPreview =
    !simpleView && Boolean(latestDeployment?.deploymentStatus);
  const hasPrLinkItems = showCreatePr || showViewPr || showViewPreview;
  const showMoreMenu =
    isHeader ||
    showResolveConflicts ||
    hasSandboxCommandItems ||
    hasPrLinkItems;
  const hasSecondaryContent = isHeader || showStopSandbox || showMoreMenu;

  return (
    <div
      className={
        isHeader
          ? "flex shrink-0 items-center gap-1.5 sm:gap-2"
          : "space-y-2 w-full"
      }
    >
      {!isHeader && (executionError || latestPrError) ? (
        <p className="text-xs text-destructive text-right">
          {executionError ?? latestPrError}
        </p>
      ) : null}
      <div
        className={
          isHeader
            ? "flex shrink-0 items-center gap-1.5 sm:gap-2"
            : "flex items-center gap-3 flex-wrap justify-end"
        }
      >
        {isHeader && (executionError || latestPrError) ? (
          <p className="text-xs text-destructive max-w-[min(240px,40vw)] truncate">
            {executionError ?? latestPrError}
          </p>
        ) : null}
        {showRunButton && (
          <SplitRunButton
            taskId={taskId}
            scheduledAt={task?.scheduledAt}
            isStarting={isStarting}
            onStartExecution={onStartExecution}
            size={buttonSize}
          />
        )}
        {showRunButton && hasSecondaryContent && (
          <div className="h-6 w-px bg-muted-foreground/20" />
        )}
        <div
          className={
            isHeader
              ? "flex shrink-0 items-center gap-1.5 sm:gap-2"
              : "flex flex-wrap items-center gap-1.5 sm:gap-2"
          }
        >
          {showMoreMenu && (
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
                {showResolveConflicts && (
                  <DropdownMenuItem
                    onClick={onResolveConfirm}
                    disabled={isStarting}
                    title={skipConfirmTitle("Resolve Conflicts")}
                  >
                    {isStarting ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconHammer size={14} />
                    )}
                    Resolve Conflicts
                    <ConfirmSkipHint />
                  </DropdownMenuItem>
                )}
                {showResolveConflicts && hasSandboxCommandItems ? (
                  <DropdownMenuSeparator />
                ) : null}
                {showRunStartupCommands && (
                  <DropdownMenuItem
                    onClick={onRunStartupCommands}
                    disabled={isRetryingStartupCommands}
                    title={skipConfirmTitle("Run Startup Commands")}
                  >
                    {isRetryingStartupCommands ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconRefresh size={14} />
                    )}
                    Run Startup Commands
                    <ConfirmSkipHint />
                  </DropdownMenuItem>
                )}
                {showRunDevServer ? (
                  <DropdownMenuItem
                    onClick={onRunDevServer}
                    disabled={isRunningDevServer}
                    title={skipConfirmTitle("Run Dev Server")}
                  >
                    {isRunningDevServer ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconPlayerPlay size={14} />
                    )}
                    Run Dev Server
                    <ConfirmSkipHint />
                  </DropdownMenuItem>
                ) : null}
                {showRunBackgroundCommands ? (
                  <DropdownMenuItem
                    onClick={onRunBackgroundCommands}
                    disabled={isRunningBackgroundCommands}
                  >
                    {isRunningBackgroundCommands ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconServerBolt size={14} />
                    )}
                    Run Background Commands
                  </DropdownMenuItem>
                ) : null}
                {(showResolveConflicts || hasSandboxCommandItems) &&
                hasPrLinkItems ? (
                  <DropdownMenuSeparator />
                ) : null}
                {showCreatePr && (
                  <DropdownMenuItem
                    onClick={onCreatePr}
                    disabled={isCreatingPr}
                  >
                    {isCreatingPr ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconGitPullRequest size={14} />
                    )}
                    Create PR
                  </DropdownMenuItem>
                )}
                {showViewPr && latestPrUrl ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={latestPrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconGitPullRequest size={14} />
                      View PR
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {showViewPreview && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <DropdownMenuItem disabled>
                          <IconBrandVercel size={14} />
                          View Preview
                        </DropdownMenuItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      Please start sandbox and view changes through the preview
                      tab there instead
                    </TooltipContent>
                  </Tooltip>
                )}
                {isHeader ? (
                  <>
                    {(showResolveConflicts ||
                      hasSandboxCommandItems ||
                      hasPrLinkItems) && <DropdownMenuSeparator />}
                    <CopyLinkMenuItem iconSize={14} />
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {showStopSandbox ? (
            <SleepEvaButton
              onStop={onStopSandbox}
              isStopping={isSandboxStopping}
              blockedMidTurn={sleepBlockedMidTurn}
              size={buttonSize}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const SPLIT_BUTTON_HALF =
  "hover:translate-y-0 active:scale-100 group-hover/split:bg-primary/92";

function SplitRunButton({
  taskId,
  scheduledAt,
  isStarting,
  onStartExecution,
  size,
}: {
  taskId: Id<"agentTasks">;
  scheduledAt: number | undefined;
  isStarting: boolean;
  onStartExecution: () => void;
  size: "default" | "sm";
}) {
  const chevronRef = useRef<HTMLButtonElement>(null);
  const isScheduled = scheduledAt !== undefined;
  const iconSize = size === "sm" ? 16 : 18;

  // The two halves cancel their own press (`SPLIT_BUTTON_HALF`) so the wrapper
  // scales as one unit. `motion-press` owns that: the hand-listed
  // `transition-[transform,background-color]` it replaces named `transform`,
  // which never matches the `scale` property Tailwind compiles `scale-[0.96]`
  // to, so the split button did not press at all.
  return (
    <div className="group/split motion-press flex items-center active:scale-[0.96]">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              size={size}
              onClick={
                isScheduled
                  ? () => chevronRef.current?.click()
                  : onStartExecution
              }
              disabled={isStarting}
              className={`rounded-r-none ${SPLIT_BUTTON_HALF}`}
            >
              {isStarting ? (
                <IconLoader2 size={iconSize} className="animate-spin" />
              ) : isScheduled ? (
                <IconCalendarClock size={iconSize} />
              ) : (
                <IconPlayerPlay size={iconSize} />
              )}
              {isScheduled
                ? dayjs(scheduledAt).format("MMM D, h:mm A")
                : "Run Eva"}
            </Button>
          </div>
        </TooltipTrigger>
        {isScheduled && (
          <TooltipContent>Click to change or remove schedule</TooltipContent>
        )}
      </Tooltip>
      <SchedulePopover
        taskId={taskId}
        scheduledAt={scheduledAt}
        trigger={
          <Button
            ref={chevronRef}
            size={size}
            aria-label="Schedule options"
            className={`rounded-l-none border-l border-l-primary-foreground/20 px-2 ${SPLIT_BUTTON_HALF}`}
          >
            <IconChevronDown size={14} />
          </Button>
        }
      />
    </div>
  );
}
