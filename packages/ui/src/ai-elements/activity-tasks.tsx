"use client";

import { createContext, memo, useCallback, useContext, useRef, useState } from "react";
import type { ComponentProps, ReactNode, Ref } from "react";
import { flushSync } from "react-dom";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  IconChevronDown,
  IconCircle,
  IconCircleCheck,
  IconGitBranch,
  IconSearch,
  IconTerminal2,
} from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { CircleSpinner, Spinner } from "../ui/spinner";
import { CrossfadeIconSlot } from "../ui/crossfade-icon";
import { motionFast, motionStagger } from "../utils/motion";
import { m } from "motion/react";
import { Shimmer } from "./shimmer";
import {
  type ActivityStep,
  type TodoItem,
  stepConfig,
  stepHasRichDetail,
  useSpinnerVerb,
  useElapsedSeconds,
  formatElapsed,
} from "./activity-shared";
import {
  type ActivityRow,
  type ActivitySegment,
  activityRowKey,
  activitySegmentKey,
  buildActivityRows,
  groupActivityRows,
} from "./activity-tasks-utils";
import {
  deriveActionGroupSummary,
  deriveStepRowPresentation,
  resolveCommandVisualKind,
  type CommandVisualKind,
} from "./activity-step-label";
import { ActivityStepDetail } from "./activity-step-detail";
import { MessageResponse } from "./message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning";
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from "./task";

const ActivityStreamingHeader = memo(function ActivityStreamingHeader({
  steps,
  name,
  startedAt,
}: {
  steps: ActivityStep[];
  name?: string;
  startedAt?: number;
}) {
  const verb = useSpinnerVerb(true);
  const elapsed = useElapsedSeconds(startedAt, true);
  const activeStep = steps.find((s) => s.status === "active") ?? steps[0];
  const headerText = `${
    activeStep?.label ?? `${name ?? "Eva"} is ${verb.toLowerCase()}...`
  }${startedAt ? ` (${formatElapsed(elapsed)})` : ""}`;
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Spinner size="sm" />
      <Shimmer as="span" duration={2.5} spread={1.5}>
        {headerText}
      </Shimmer>
    </div>
  );
});

/** Max timeline blocks shown before the overflow toggle appears. */
const MAX_VISIBLE_ROWS = 8;

/** Max nested child rows shown under a subtask before "+N more". */
const MAX_VISIBLE_CHILDREN = 8;

const HIDDEN_TYPES = new Set<ActivityStep["type"]>(["thinking", "response"]);

/** Nearest ancestor that actually scrolls — used to keep the overflow toggle pinned. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let current = el.parentElement;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (
      (overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Expand/collapse while keeping `anchor` visually fixed (t3code work-group
 * toggle pattern). Content inserted above the control would otherwise shove it
 * down the viewport.
 */
function toggleWithScrollCompensation(
  anchor: HTMLElement,
  toggle: () => void,
): void {
  const scrollParent = findScrollParent(anchor);
  const bottomBefore = anchor.getBoundingClientRect().bottom;
  flushSync(toggle);
  const delta = anchor.getBoundingClientRect().bottom - bottomBefore;
  if (!scrollParent || Math.abs(delta) < 0.5) {
    return;
  }
  scrollParent.scrollTop += delta;
}

export type { ActivityStep };

/**
 * Asks the owner of the payload for the untrimmed steps. Passed by context
 * rather than props because all three collapsibles that can reveal a stripped
 * row sit at different depths, and none of them otherwise needs the callback.
 */
const RequestFullDetailContext = createContext<(() => void) | undefined>(
  undefined,
);

/** `onOpenChange` handler that asks for the full payload the first time a fold opens. */
function useRequestFullDetailOnOpen(): (open: boolean) => void {
  const request = useContext(RequestFullDetailContext);
  return (open: boolean) => {
    if (open) request?.();
  };
}

export interface ActivityTasksProps extends ComponentProps<"div"> {
  steps: ActivityStep[];
  isStreaming?: boolean;
  name?: string;
  icon?: ReactNode;
  startedAt?: number;
  duration?: string;
  /** @deprecated Unused; kept so existing call sites compile unchanged. */
  finalText?: string;
  /**
   * When provided, file chips with a known full path become clickable and call
   * this with the path. Pass a stable callback — {@link ActivityTasks} is memoised.
   */
  onOpenFile?: (path: string) => void;
  /**
   * Called when a reader opens a fold that may contain step detail the
   * transcript query stripped (see {@link ActivityStep.hasHiddenDetail}). Fires
   * on every open, so the owner is responsible for fetching once.
   */
  onRequestFullDetail?: () => void;
}

/** Status glyph for one todo row. */
function TodoStatusIcon({ status }: { status: TodoItem["status"] }) {
  return (
    <CrossfadeIconSlot
      iconKey={status}
      variant="soft"
      className="relative mt-0.5 flex size-3.5 shrink-0 items-center justify-center"
    >
      {status === "completed" ? (
        <IconCircleCheck className="size-3.5 text-primary" />
      ) : status === "in_progress" ? (
        <CircleSpinner size="sm" className="size-3.5" />
      ) : (
        <IconCircle className="size-3.5 text-muted-foreground" />
      )}
    </CrossfadeIconSlot>
  );
}

/** Renders a todo checklist, or a plain fallback line for legacy/empty snapshots. */
function TodoChecklist({
  todos,
  fallback,
}: {
  todos: TodoItem[];
  fallback: string;
}) {
  if (todos.length === 0) {
    return <TaskItem>{fallback}</TaskItem>;
  }
  return (
    <ul className="space-y-1">
      {todos.map((todo, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <TodoStatusIcon status={todo.status} />
          <span
            className={cn(
              "leading-snug",
              todo.status === "completed" &&
                "text-muted-foreground line-through",
              todo.status === "in_progress" && "font-medium text-foreground",
              todo.status === "pending" && "text-muted-foreground",
            )}
          >
            {todo.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

function bashIconForKind(kind: CommandVisualKind) {
  if (kind === "inspect") return IconSearch;
  if (kind === "git") return IconGitBranch;
  return IconTerminal2;
}

/** Glyph for a step — shell steps swap in a glyph matching what they ran. */
function iconForStep(step: ActivityStep) {
  if (step.type === "bash" && step.detail) {
    return bashIconForKind(resolveCommandVisualKind(step.detail));
  }
  return (stepConfig[step.type] ?? stepConfig.tool).icon;
}

/**
 * One thinking block behind a "Thought for Ns" trigger. Streaming steps open
 * themselves so live thinking is readable as it lands, then auto-close.
 */
function ActivityReasoningDisclosure({ step }: { step: ActivityStep }) {
  const thoughts = step.detail?.trim() ?? "";
  const isActive = step.status === "active";
  const seconds = step.durationMs
    ? Math.max(1, Math.round(step.durationMs / 1000))
    : undefined;
  return (
    <Reasoning
      className="mb-0"
      isStreaming={isActive}
      defaultOpen={isActive}
      duration={isActive ? undefined : seconds}
    >
      <ReasoningTrigger />
      {thoughts ? <ReasoningContent>{thoughts}</ReasoningContent> : null}
    </Reasoning>
  );
}

/** One per-call activity row with Synara-style humanized label. */
function ActivityStepRow({
  row,
  onOpenFile,
  depth = 0,
}: {
  row: ActivityRow;
  onOpenFile?: (path: string) => void;
  depth?: number;
}) {
  const { step, children } = row;
  const isActive = step.status === "active";
  const presentation = deriveStepRowPresentation(step, isActive);
  const requestFullDetail = useRequestFullDetailOnOpen();

  if (step.type === "todos") {
    return (
      <Task defaultOpen={isActive} className="w-full">
        <TaskTrigger
          title={
            isActive ? (
              <Shimmer as="span" duration={2.5} spread={1.5}>
                {presentation.text}
              </Shimmer>
            ) : (
              <span>{presentation.text}</span>
            )
          }
        />
        <TaskContent>
          <TodoChecklist
            todos={step.todos ?? []}
            fallback={step.detail ?? step.label}
          />
        </TaskContent>
      </Task>
    );
  }

  if (step.type === "reasoning") {
    return <ActivityReasoningDisclosure step={step} />;
  }

  const Icon = iconForStep(step);

  const label = (
    <span className="min-w-0 truncate" title={presentation.title}>
      {isActive ? (
        <Shimmer as="span" duration={2.5} spread={1.5}>
          {presentation.text}
        </Shimmer>
      ) : (
        presentation.text
      )}
    </span>
  );

  const fileChip = presentation.fileChip ? (
    presentation.fileChip.path && onOpenFile ? (
      <button
        type="button"
        title={presentation.fileChip.path}
        onClick={(event) => {
          event.stopPropagation();
          const path = presentation.fileChip?.path;
          if (path) onOpenFile(path);
        }}
        className="inline-flex min-w-0 max-w-full cursor-pointer"
      >
        <TaskItemFile className="transition-colors hover:bg-muted">
          {presentation.fileChip.name}
        </TaskItemFile>
      </button>
    ) : (
      <TaskItemFile>{presentation.fileChip.name}</TaskItemFile>
    )
  ) : null;

  const visibleChildren = children ?? [];
  const childOverflow = visibleChildren.length - MAX_VISIBLE_CHILDREN;
  const shownChildren =
    childOverflow > 0
      ? visibleChildren.slice(0, MAX_VISIBLE_CHILDREN)
      : visibleChildren;

  const hasDetail = stepHasRichDetail(step);

  const rowHeader = (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        step.isError ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <CrossfadeIconSlot
        iconKey={`${step.type}-${step.status}`}
        variant="soft"
        className="relative flex size-4 shrink-0 items-center justify-center"
      >
        <Icon className="size-4" />
      </CrossfadeIconSlot>
      {label}
      {fileChip}
    </div>
  );

  const childrenBlock =
    shownChildren.length > 0 ? (
      <div
        className={cn(
          "space-y-1",
          depth === 0 && "ml-1 border-l border-border pl-3",
        )}
      >
        {shownChildren.map((child, i) => (
          <ActivityStepRow
            key={activityRowKey(child, i)}
            row={child}
            onOpenFile={onOpenFile}
            depth={depth + 1}
          />
        ))}
        {childOverflow > 0 ? (
          <p className="text-xs text-muted-foreground">+{childOverflow} more</p>
        ) : null}
      </div>
    ) : null;

  if (hasDetail) {
    return (
      <div className="space-y-1">
        <Collapsible className="group w-full" onOpenChange={requestFullDetail}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-left transition-colors hover:text-foreground">
            {rowHeader}
            <IconChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5 ml-6 space-y-1 border-l border-border pl-3 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            <ActivityStepDetail step={step} onOpenFile={onOpenFile} />
          </CollapsibleContent>
        </Collapsible>
        {childrenBlock}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {rowHeader}
      {childrenBlock}
    </div>
  );
}

/** Model reasoning, shown as ordinary prose rather than another muted row. */
function ActivityReasoningBlock({ step }: { step: ActivityStep }) {
  const thoughts = step.detail?.trim();
  if (!thoughts) return null;
  return (
    <MessageResponse className="my-1 text-foreground text-sm leading-relaxed">
      {thoughts}
    </MessageResponse>
  );
}

/** A run of tool calls, folded behind one muted "what happened" summary line. */
function ActivityActionGroup({
  rows,
  onOpenFile,
}: {
  rows: ActivityRow[];
  onOpenFile?: (path: string) => void;
}) {
  const steps = rows.map((row) => row.step);
  const isActive = steps.some((step) => step.status === "active");
  const summary = deriveActionGroupSummary(steps);
  const firstStep = steps[0];
  const Icon = firstStep ? iconForStep(firstStep) : IconTerminal2;
  const requestFullDetail = useRequestFullDetailOnOpen();

  return (
    <Collapsible
      className="group py-2 w-full"
      defaultOpen={isActive}
      onOpenChange={requestFullDetail}
    >
      {/* Summary stays muted even when a call inside failed: agents run failing
          commands on purpose, so one non-zero exit should not paint the run red.
          The failed row itself is still red once the fold is open. */}
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-muted-foreground text-sm transition-colors hover:text-foreground">
        <CrossfadeIconSlot
          iconKey={isActive ? "group-active" : "group-idle"}
          variant="soft"
          className="relative flex size-4 shrink-0 items-center justify-center"
        >
          <Icon className="size-4" />
        </CrossfadeIconSlot>
        <span className="min-w-0 truncate" title={summary}>
          {isActive ? (
            <Shimmer as="span" duration={2.5} spread={1.5}>
              {summary}
            </Shimmer>
          ) : (
            summary
          )}
        </span>
        <IconChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 ml-2 space-y-1.5 border-l border-border pl-3 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        {rows.map((row, i) => (
          <ActivityStepRow
            key={activityRowKey(row, i)}
            row={row}
            onOpenFile={onOpenFile}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ActivitySegmentBlock({
  segment,
  onOpenFile,
}: {
  segment: ActivitySegment;
  onOpenFile?: (path: string) => void;
}) {
  if (segment.kind === "reasoning") {
    return <ActivityReasoningBlock step={segment.step} />;
  }
  if (segment.kind === "row") {
    return <ActivityStepRow row={segment.row} onOpenFile={onOpenFile} />;
  }
  return <ActivityActionGroup rows={segment.rows} onOpenFile={onOpenFile} />;
}

/**
 * Renders timeline blocks with an overflow cap. Settled turns cap from the front
 * (first N); streaming turns cap from the end (newest N) so latest stays visible.
 */
function ActivityRowList({
  rows,
  isStreaming,
  onOpenFile,
}: {
  rows: ActivityRow[];
  isStreaming?: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const segments = groupActivityRows(rows);
  const keyedSegments = segments.map((segment, index) => ({
    segment,
    key: activitySegmentKey(segment, index),
  }));
  const overflow = keyedSegments.length - MAX_VISIBLE_ROWS;
  const isCapped = overflow > 0 && !expanded;
  const visible = isCapped
    ? isStreaming
      ? keyedSegments.slice(keyedSegments.length - MAX_VISIBLE_ROWS)
      : keyedSegments.slice(0, MAX_VISIBLE_ROWS)
    : keyedSegments;

  const handleToggle = useCallback(() => {
    const anchor = toggleRef.current;
    if (!anchor) {
      setExpanded((value) => !value);
      return;
    }
    toggleWithScrollCompensation(anchor, () => {
      setExpanded((value) => !value);
    });
  }, []);

  const toggle =
    overflow > 0 ? (
      <OverflowToggle
        ref={toggleRef}
        expanded={expanded}
        overflow={overflow}
        onToggle={handleToggle}
      />
    ) : null;

  return (
    <>
      {isStreaming && toggle}
      {visible.map(({ segment, key }, index) => (
        <m.div
          key={key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            ...motionFast,
            delay: motionStagger(index, 0.02, 0.08),
          }}
        >
          <ActivitySegmentBlock segment={segment} onOpenFile={onOpenFile} />
        </m.div>
      ))}
      {!isStreaming && toggle}
    </>
  );
}

function OverflowToggle({
  ref,
  expanded,
  overflow,
  onToggle,
}: {
  ref?: Ref<HTMLButtonElement>;
  expanded: boolean;
  overflow: number;
  onToggle: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      className="w-fit text-muted-foreground text-sm transition-colors hover:text-foreground"
    >
      {expanded ? "Show less" : `Show ${overflow} more`}
    </button>
  );
}

export const ActivityTasks = memo(
  ({
    steps,
    isStreaming,
    name,
    icon: _icon,
    className,
    startedAt,
    duration,
    finalText,
    onOpenFile,
    onRequestFullDetail,
    ...props
  }: ActivityTasksProps) => {
    const rows = buildActivityRows(steps).filter(
      (row) => !HIDDEN_TYPES.has(row.step.type),
    );

    if (rows.length === 0 && !isStreaming) return null;

    void finalText;

    if (!isStreaming && duration) {
      return (
        <RequestFullDetailContext value={onRequestFullDetail}>
          <Collapsible
            className={cn("group text-sm", className)}
            defaultOpen={false}
            // Opening the turn prefetches the stripped detail, so the rows
            // inside already have their bodies by the time one is clicked.
            onOpenChange={(open) => {
              if (open) onRequestFullDetail?.();
            }}
            {...props}
          >
            <CollapsibleTrigger className="flex w-full items-center gap-2 border-b border-border pb-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground">
              <span>Worked for {duration}</span>
              <IconChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1.5 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
              <ActivityRowList
                rows={rows}
                isStreaming={false}
                onOpenFile={onOpenFile}
              />
            </CollapsibleContent>
          </Collapsible>
        </RequestFullDetailContext>
      );
    }

    return (
      <RequestFullDetailContext value={onRequestFullDetail}>
        <div className={cn("space-y-1.5 text-sm", className)} {...props}>
          {isStreaming && rows.length === 0 ? (
            <ActivityStreamingHeader
              steps={steps}
              name={name}
              startedAt={startedAt}
            />
          ) : null}
          <ActivityRowList
            rows={rows}
            isStreaming={isStreaming}
            onOpenFile={onOpenFile}
          />
        </div>
      </RequestFullDetailContext>
    );
  },
);

ActivityTasks.displayName = "ActivityTasks";
