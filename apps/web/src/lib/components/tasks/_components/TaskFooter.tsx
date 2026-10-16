"use client";

import { useRef } from "react";
import type { api, Doc, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  motionFast,
  CrossfadeIconSlot,
  CircleSpinner,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconPlayerPlay,
  IconChevronDown,
  IconCalendarClock,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { usePrLinkMenuItems } from "@/lib/components/PrLinkMenuItems";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import type { TaskStatus } from "../TaskStatusBadge";
import { SchedulePopover } from "../SchedulePopover";
import {
  getMoreMenuVisibility,
  TaskFooterMoreMenu,
} from "./TaskFooterMoreMenu";

type RunDoc = NonNullable<
  FunctionReturnType<typeof api.agentRuns.listByTask>
>[number];

interface TaskFooterProps {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks"> | undefined;
  /** Main run or chat turn: `useTaskAgentActive`. */
  isAgentActive: boolean;
  status: TaskStatus | undefined;
  hasActiveRun: boolean;
  hasRuns: boolean;
  latestPrUrl: string | undefined;
  latestPrError: string | undefined;
  latestDeployment: RunDoc | undefined;
  executionError: string | null;
  isStarting: boolean;
  canStartSandbox: boolean;
  isSandboxActive: boolean;
  isSandboxStarting: boolean;
  isSandboxStopping: boolean;
  isRetryingStartupCommands: boolean;
  isRunningDevServer: boolean;
  isRunningBackgroundCommands: boolean;
  canCreatePr: boolean;
  isCreatingPr: boolean;
  onCreatePr: () => void;
  onStartSandbox: () => void;
  onStopSandbox: () => void;
  onRunStartupCommands: () => void;
  onRunDevServer: () => void;
  onRunBackgroundCommands: () => void;
  onStartExecution: () => void;
  onResolveConfirm: () => void;
  variant?: "footer" | "header";
}

const TASK_FOOTER_LAYOUT = {
  header: {
    buttonSize: "sm",
    iconSize: 16,
    root: "flex shrink-0 items-center gap-1.5 sm:gap-2",
    row: "flex shrink-0 items-center gap-1.5 sm:gap-2",
    actions: "flex shrink-0 items-center gap-1.5 sm:gap-2",
  },
  footer: {
    buttonSize: "default",
    iconSize: 18,
    root: "space-y-2 w-full",
    row: "flex items-center gap-3 flex-wrap justify-end",
    actions: "flex flex-wrap items-center gap-1.5 sm:gap-2",
  },
} satisfies Record<
  "footer" | "header",
  {
    buttonSize: "default" | "sm";
    iconSize: number;
    root: string;
    row: string;
    actions: string;
  }
>;

// `todo` only offers a first run; once it has run, the sandbox toggle takes
// its place (`canStartSandbox` covers that case).
function getShowRunButton({
  task,
  status,
  hasRuns,
  hasActiveRun,
}: {
  task: Doc<"agentTasks"> | undefined;
  status: TaskStatus | undefined;
  hasRuns: boolean;
  hasActiveRun: boolean;
}): boolean {
  return (
    !task?.projectId &&
    ((status === "todo" && !hasRuns) ||
      (status === "in_progress" && !hasActiveRun))
  );
}

function TaskFooterError({
  visible,
  motionKey,
  className,
  executionError,
  latestPrError,
}: {
  visible: boolean;
  motionKey: string;
  className: string;
  executionError: string | null;
  latestPrError: string | undefined;
}) {
  return (
    <AnimatePresence initial={false}>
      {visible && (executionError || latestPrError) ? (
        <m.p
          key={motionKey}
          className={className}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          {executionError ?? latestPrError}
        </m.p>
      ) : null}
    </AnimatePresence>
  );
}

export function TaskFooter({
  taskId,
  task,
  isAgentActive,
  status,
  hasActiveRun,
  hasRuns,
  latestPrUrl,
  latestPrError,
  latestDeployment,
  executionError,
  isStarting,
  canStartSandbox,
  isSandboxActive,
  isSandboxStarting,
  isSandboxStopping,
  isRetryingStartupCommands,
  isRunningDevServer,
  isRunningBackgroundCommands,
  canCreatePr,
  isCreatingPr,
  onCreatePr,
  onStartSandbox,
  onStopSandbox,
  onRunStartupCommands,
  onRunDevServer,
  onRunBackgroundCommands,
  onStartExecution,
  onResolveConfirm,
  variant = "footer",
}: TaskFooterProps) {
  const simpleView = useSimpleView();
  const isHeader = variant === "header";
  const layout = TASK_FOOTER_LAYOUT[variant];
  const { buttonSize, iconSize } = layout;
  const showRunButton = getShowRunButton({
    task,
    status,
    hasRuns,
    hasActiveRun,
  });
  // One control for both directions, on every surface: the sandbox chat header
  // no longer carries a start/stop pair, so a header that only knew how to stop
  // left a slept sandbox with no way back. Held open through both transitions
  // rather than popping out, so the row does not jump while it wakes or sleeps.
  const showSandboxToggle = isSandboxActive || canStartSandbox;
  // Inert, not hidden, mid-turn — see `SleepControlTooltip`. Gated on the one
  // "sandbox busy" status (main run or chat turn, synthetic turns included),
  // not `hasActiveRun`: that also counts *queued* runs, and a task waiting in
  // the queue is no reason to refuse to sleep it.
  const sleepBlockedMidTurn = isAgentActive;
  const prLinks = usePrLinkMenuItems({
    createPr: {
      enabled: canCreatePr,
      isCreating: isCreatingPr,
      onCreate: onCreatePr,
    },
    prUrl: latestPrUrl,
    owner: { kind: "task", taskId },
    hasDeployment: Boolean(latestDeployment?.deploymentStatus),
  });
  const moreMenu = getMoreMenuVisibility({
    simpleView,
    hasActiveRun,
    status,
    canStartSandbox,
    isSandboxActive,
    isHeader,
    hasPrItems: prLinks.hasItems,
  });
  const hasSecondaryContent =
    isHeader || showSandboxToggle || moreMenu.showMoreMenu;

  return (
    <div className={layout.root}>
      <TaskFooterError
        visible={!isHeader}
        motionKey="footer-error"
        className="text-xs text-destructive text-right"
        executionError={executionError}
        latestPrError={latestPrError}
      />
      <div className={layout.row}>
        <TaskFooterError
          visible={isHeader}
          motionKey="header-error"
          className="text-xs text-destructive max-w-[min(240px,40vw)] truncate"
          executionError={executionError}
          latestPrError={latestPrError}
        />
        <AnimatePresence initial={false} mode="popLayout">
          {showRunButton ? (
            <m.div
              key="run-eva"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <SplitRunButton
                taskId={taskId}
                scheduledAt={task?.scheduledAt}
                isStarting={isStarting}
                onStartExecution={onStartExecution}
                size={buttonSize}
              />
            </m.div>
          ) : null}
        </AnimatePresence>
        {showRunButton && hasSecondaryContent && (
          <div className="h-6 w-px bg-muted-foreground/20" />
        )}
        <div className={layout.actions}>
          {moreMenu.showMoreMenu && (
            <TaskFooterMoreMenu
              visibility={moreMenu}
              prLinks={prLinks}
              isHeader={isHeader}
              buttonSize={buttonSize}
              iconSize={iconSize}
              isStarting={isStarting}
              isRetryingStartupCommands={isRetryingStartupCommands}
              isRunningDevServer={isRunningDevServer}
              isRunningBackgroundCommands={isRunningBackgroundCommands}
              onResolveConfirm={onResolveConfirm}
              onRunStartupCommands={onRunStartupCommands}
              onRunDevServer={onRunDevServer}
              onRunBackgroundCommands={onRunBackgroundCommands}
            />
          )}
          <AnimatePresence initial={false} mode="popLayout">
            {showSandboxToggle ? (
              <m.div
                key="toggle-sandbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                <SandboxStartStopButton
                  isActive={isSandboxActive}
                  isToggling={isSandboxStarting || isSandboxStopping}
                  onToggle={(action) => {
                    if (action === "start") onStartSandbox();
                    else onStopSandbox();
                  }}
                  isAssistantResponding={sleepBlockedMidTurn}
                  size={buttonSize}
                />
              </m.div>
            ) : null}
          </AnimatePresence>
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
              <CrossfadeIconSlot
                iconKey={
                  isStarting ? "loading" : isScheduled ? "scheduled" : "run"
                }
                className="relative flex size-[18px] items-center justify-center"
              >
                {isStarting ? (
                  <CircleSpinner
                    size="sm"
                    style={{ width: iconSize, height: iconSize }}
                  />
                ) : isScheduled ? (
                  <IconCalendarClock size={iconSize} />
                ) : (
                  <IconPlayerPlay size={iconSize} />
                )}
              </CrossfadeIconSlot>
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
