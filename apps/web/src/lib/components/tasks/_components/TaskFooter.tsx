"use client";

import { CHAT_HEADER_ACTIONS_CLASS } from "@/lib/components/ChatPageWrapper";
import { useRef } from "react";
import { taskScheduledAt, type api, type Doc, type Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  tokenTransition,
  CrossfadeIconSlot,
  Spinner,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconPlayerPlay,
  IconChevronDown,
  IconCalendarClock,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { usePrLinkMenuItems } from "@/lib/components/PrLinkMenuItems";
import { SandboxCommitPushButton } from "@/lib/components/sandbox/SandboxCommitPushButton";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import type { TaskStatus } from "../TaskStatusBadge";
import { SchedulePopover } from "../SchedulePopover";
import { PrMergeConfetti } from "@/lib/components/celebration/PrMergeConfetti";
import {
  getMoreMenuVisibility,
  TaskFooterMoreMenu,
} from "./TaskFooterMoreMenu";
import { TaskHeaderMenu } from "./TaskHeaderMenu";
import { ArchivedLabel } from "@/lib/components/ArchivedLabel";
import type { OwnedSandboxFields } from "@/lib/components/sandbox/useOwnedSession";

type RunDoc = NonNullable<
  FunctionReturnType<typeof api.agentRuns.listByTask>
>[number];

interface TaskFooterProps {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks"> | undefined;
  chatId?: Id<"sessionChats">;
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
  sandbox: Pick<OwnedSandboxFields, "sandboxGitSync" | "gitTarget">;
  canCreatePr: boolean;
  isCreatingPr: boolean;
  onCreatePr: () => void;
  onStartSandbox: () => void;
  onStopSandbox: () => void;
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
    actions: CHAT_HEADER_ACTIONS_CLASS,
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
    task?.archivedAt === undefined &&
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
          transition={tokenTransition.fast}
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
  chatId,
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
  sandbox,
  canCreatePr,
  isCreatingPr,
  onCreatePr,
  onStartSandbox,
  onStopSandbox,
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
  const showSandboxToggle = isSandboxActive || canStartSandbox;
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
              transition={tokenTransition.fast}
            >
              <SplitRunButton
                taskId={taskId}
                scheduledAt={task ? taskScheduledAt(task) : undefined}
                isStarting={isStarting}
                onStartExecution={onStartExecution}
                size={buttonSize}
              />
            </m.div>
          ) : null}
        </AnimatePresence>
        {showRunButton && hasSecondaryContent && !isHeader && (
          <div className="h-6 w-px bg-muted-foreground/20" />
        )}
        <div className={layout.actions}>
          {isHeader && task?.archivedAt !== undefined ? (
            <ArchivedLabel />
          ) : null}
          {isHeader ? (
            <PrMergeConfetti owner={{ kind: "task", taskId }} />
          ) : null}
          {isHeader && task ? (
            <TaskHeaderMenu
              task={task}
              chatId={chatId}
              buttonSize={buttonSize}
              iconSize={iconSize}
              createPr={{
                enabled: canCreatePr,
                isCreating: isCreatingPr,
                onCreate: onCreatePr,
              }}
              visibility={moreMenu}
              isStarting={isStarting}
              onResolveConfirm={onResolveConfirm}
            />
          ) : moreMenu.showMoreMenu ? (
            <TaskFooterMoreMenu
              visibility={moreMenu}
              prLinks={prLinks}
              buttonSize={buttonSize}
              iconSize={iconSize}
              isStarting={isStarting}
              onResolveConfirm={onResolveConfirm}
            />
          ) : null}
          <SandboxCommitPushButton
            gitSync={sandbox.sandboxGitSync}
            isSandboxActive={isSandboxActive}
            target={sandbox.gitTarget}
            size={buttonSize}
          />
          <AnimatePresence initial={false} mode="popLayout">
            {showSandboxToggle ? (
              <m.div
                key="toggle-sandbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={tokenTransition.fast}
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

  return (
    <div className="group/split motion-press flex items-center active:scale-[0.96]">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              shape="rounded"
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
                  <Spinner
                    variant="circle"
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
            shape="rounded"
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
