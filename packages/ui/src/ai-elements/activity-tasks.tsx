"use client";

import { createContext, memo, useCallback, useContext, useRef, useState } from "react";
import type { ComponentProps, ReactNode, Ref } from "react";
import { flushSync } from "react-dom";

import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import {
  IconBrain,
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
import { Markdown } from "../markdown/Markdown";
import { FileChip } from "./file-chip";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
  type TraceStatus,
} from "./trace";
import { useStreamingDisclosure } from "./use-streaming-disclosure";

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
    return <p className="text-muted-foreground text-sm">{fallback}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {todos.map((todo, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-2 text-sm",
            todo.status === "pending" && "opacity-60",
          )}
        >
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

function traceStatusForStep(step: ActivityStep): TraceStatus | undefined {
  if (step.isError) return "error";
  if (step.status === "active") return "running";
  if (step.status === "pending") return "pending";
  return undefined;
}

/** Whole seconds a finished step took; undefined when unknown or under 1s. */
function stepSeconds(step: ActivityStep): number | undefined {
  if (step.status !== "complete" || !step.durationMs) return undefined;
  const seconds = Math.round(step.durationMs / 1000);
  return seconds >= 1 ? seconds : undefined;
}

/**
 * One thinking block behind a "Thought  12s" line. Streaming steps open
 * themselves so live thinking is readable as it lands, then auto-close.
 */
function ActivityReasoningLine({ step }: { step: ActivityStep }) {
  const thoughts = step.detail?.trim() ?? "";
  const isActive = step.status === "active";
  const disclosure = useStreamingDisclosure(isActive);
  const seconds = stepSeconds(step);
  const line = (
    <TraceLine status={isActive ? "running" : undefined}>
      <TraceIcon>
        <IconBrain />
      </TraceIcon>
      <TraceTitle shimmer={isActive}>
        {isActive ? "Thinking..." : "Thought"}
      </TraceTitle>
      {seconds ? (
        <TraceDescription>{formatElapsed(seconds)}</TraceDescription>
      ) : null}
    </TraceLine>
  );
  if (!thoughts) return line;
  return (
    <TraceCollapsible open={disclosure.open} onOpenChange={disclosure.onOpenChange}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Markdown className="text-sm">{thoughts}</Markdown>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/** The to-do snapshot as one line with done/total, folding open to the checklist. */
function ActivityTodosLine({ step }: { step: ActivityStep }) {
  const isActive = step.status === "active";
  const todos = step.todos ?? [];
  const done = todos.filter((todo) => todo.status === "completed").length;
  const presentation = deriveStepRowPresentation(step, isActive);
  const Icon = stepConfig.todos.icon;
  return (
    <TraceCollapsible defaultOpen={isActive}>
      <TraceCollapsibleTrigger>
        <TraceLine status={isActive ? "running" : undefined}>
          <TraceIcon>
            <Icon />
          </TraceIcon>
          <TraceTitle shimmer={isActive}>{presentation.text}</TraceTitle>
          {todos.length > 0 ? (
            <TraceDescription>
              {done}/{todos.length}
            </TraceDescription>
          ) : null}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <TodoChecklist todos={todos} fallback={step.detail ?? step.label} />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/** One per-call activity line with Synara-style humanized label. */
function ActivityStepRow({
  row,
  onOpenFile,
}: {
  row: ActivityRow;
  onOpenFile?: (path: string) => void;
}) {
  const { step, children } = row;
  const isActive = step.status === "active";
  const presentation = deriveStepRowPresentation(step, isActive);
  const requestFullDetail = useRequestFullDetailOnOpen();

  if (step.type === "todos") return <ActivityTodosLine step={step} />;
  if (step.type === "reasoning") return <ActivityReasoningLine step={step} />;

  const Icon = iconForStep(step);
  const childRows = children ?? [];
  const childOverflow = childRows.length - MAX_VISIBLE_CHILDREN;
  const shownChildren =
    childOverflow > 0 ? childRows.slice(0, MAX_VISIBLE_CHILDREN) : childRows;
  const seconds = stepSeconds(step);
  const description =
    childRows.length > 0
      ? `${childRows.length} ${childRows.length === 1 ? "step" : "steps"}`
      : seconds
        ? formatElapsed(seconds)
        : undefined;

  const fileChip = presentation.fileChip ? (
    <FileChip
      name={presentation.fileChip.name}
      path={presentation.fileChip.path}
      onOpenFile={onOpenFile}
    />
  ) : undefined;
  const lineHead = (
    <>
      <TraceIcon iconKey={`${step.type}-${step.status}`}>
        <Icon />
      </TraceIcon>
      <TraceTitle shimmer={isActive} title={presentation.title}>
        {presentation.text}
      </TraceTitle>
    </>
  );
  const descriptionNode = description ? (
    <TraceDescription>{description}</TraceDescription>
  ) : null;

  const hasDetail = stepHasRichDetail(step);
  if (!hasDetail && shownChildren.length === 0) {
    return (
      <TraceLine status={traceStatusForStep(step)}>
        {lineHead}
        {fileChip}
        {descriptionNode}
      </TraceLine>
    );
  }

  // Subagent steps start open so their inner steps stay visible, as before.
  return (
    <TraceCollapsible
      defaultOpen={shownChildren.length > 0}
      onOpenChange={requestFullDetail}
    >
      {/* The file chip opens the file viewer, so it sits beside the trigger:
          a button inside the trigger button would be invalid HTML. */}
      <TraceCollapsibleTrigger
        trailing={
          fileChip ? (
            <>
              {fileChip}
              {descriptionNode}
            </>
          ) : undefined
        }
      >
        <TraceLine status={traceStatusForStep(step)}>
          {lineHead}
          {fileChip ? null : descriptionNode}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex flex-col gap-2">
        {hasDetail ? (
          <ActivityStepDetail step={step} onOpenFile={onOpenFile} />
        ) : null}
        {shownChildren.map((child, i) => (
          <ActivityStepRow
            key={activityRowKey(child, i)}
            row={child}
            onOpenFile={onOpenFile}
          />
        ))}
        {childOverflow > 0 ? (
          <p className="text-xs text-muted-foreground">+{childOverflow} more</p>
        ) : null}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/** Model reasoning, shown as ordinary prose rather than another muted row. */
function ActivityReasoningBlock({ step }: { step: ActivityStep }) {
  const thoughts = step.detail?.trim();
  if (!thoughts) return null;
  return (
    <Markdown className="my-1 text-foreground text-sm leading-relaxed">
      {thoughts}
    </Markdown>
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
    <TraceCollapsible defaultOpen={isActive} onOpenChange={requestFullDetail}>
      {/* Summary stays muted even when a call inside failed: agents run failing
          commands on purpose, so one non-zero exit should not paint the run red.
          The failed line itself is still red once the fold is open. */}
      <TraceCollapsibleTrigger>
        <TraceLine status={isActive ? "running" : undefined}>
          <TraceIcon iconKey={isActive ? "group-active" : "group-idle"}>
            <Icon />
          </TraceIcon>
          <TraceTitle shimmer={isActive} title={summary}>
            {summary}
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <ActivityStepRow
            key={activityRowKey(row, i)}
            row={row}
            onOpenFile={onOpenFile}
          />
        ))}
      </TraceCollapsibleContent>
    </TraceCollapsible>
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
            <div className="border-b border-border pb-1.5">
              <TraceCollapsibleTrigger>
                <TraceLine>
                  <TraceTitle>{`Worked for ${duration}`}</TraceTitle>
                </TraceLine>
              </TraceCollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <Trace className="mt-2">
                <ActivityRowList
                  rows={rows}
                  isStreaming={false}
                  onOpenFile={onOpenFile}
                />
              </Trace>
            </CollapsibleContent>
          </Collapsible>
        </RequestFullDetailContext>
      );
    }

    return (
      <RequestFullDetailContext value={onRequestFullDetail}>
        <Trace className={className} {...props}>
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
        </Trace>
      </RequestFullDetailContext>
    );
  },
);

ActivityTasks.displayName = "ActivityTasks";
