import {
  Button,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  motionBase,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconCheck,
  IconCircle,
  IconListCheck,
  IconPointFilled,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";

/** One row of the agent's task list, in composer-badge shape. */
export interface ComposerTaskStep {
  readonly durationMs?: number;
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
}

interface ComposerTasksProgress {
  readonly step: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
}

/**
 * Reads the live turn's todo snapshot out of the streaming activity payload.
 * Eva's todos carry no timings, so every step renders without a duration.
 */
export function composerTaskStepsFromActivity(
  activity: string | undefined,
): ComposerTaskStep[] {
  const todos = parseActivitySteps(activity)?.find(
    (step) => step.type === "todos",
  )?.todos;
  if (!todos) return [];
  return todos.map((todo) => ({
    step: todo.content,
    status: todo.status === "in_progress" ? ("inProgress" as const) : todo.status,
  }));
}

/** "850ms" / "9.5s" / "42s" / "3m 12s". */
function formatTaskDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "0ms";
  if (durationMs < 1_000) return `${Math.max(1, Math.round(durationMs))}ms`;
  if (durationMs < 10_000) {
    const tenths = Math.round(durationMs / 100) / 10;
    // 9.95s+ rounds up into the next bucket — render "10s", not "10.0s".
    return tenths >= 10 ? "10s" : `${tenths.toFixed(1)}s`;
  }
  if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  if (seconds === 0) return `${minutes}m`;
  if (seconds === 60) return `${minutes + 1}m`;
  return `${minutes}m ${seconds}s`;
}

/** Step names repeat across a task list, so keys need an occurrence suffix. */
function keyedTaskSteps(steps: readonly ComposerTaskStep[]) {
  const occurrences = new Map<string, number>();
  return steps.map((step) => {
    const occurrence = occurrences.get(step.step) ?? 0;
    occurrences.set(step.step, occurrence + 1);
    return { key: `${step.step}:${occurrence}`, step };
  });
}

function deriveProgress(
  steps: readonly ComposerTaskStep[],
): ComposerTasksProgress {
  let completedSteps = 0;
  let current = "";
  let lastCompleted = "";
  for (const step of steps) {
    if (step.status === "completed") {
      completedSteps += 1;
      lastCompleted = step.step;
    }
    if (step.status === "inProgress" && !current) current = step.step;
  }
  const firstStep = steps[0];
  return {
    step: current || lastCompleted || firstStep?.step || "",
    completedSteps,
    totalSteps: steps.length,
  };
}

function TaskSegments({
  className,
  steps,
}: {
  readonly className?: string;
  readonly steps: readonly ComposerTaskStep[];
}) {
  if (steps.length <= 1) return null;

  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center gap-0.5", className)}
    >
      {keyedTaskSteps(steps).map(({ key, step }) => (
        <span
          key={key}
          className={cn(
            "h-[3px] min-w-0 flex-1 rounded-full",
            step.status === "completed"
              ? "bg-success"
              : step.status === "inProgress"
                ? "bg-primary"
                : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  );
}

function TaskStepRow({ step }: { readonly step: ComposerTaskStep }) {
  return (
    <div className="flex items-center gap-2 text-xs leading-5" role="listitem">
      <span
        aria-hidden
        className={cn(
          "flex w-3 shrink-0 items-center justify-center",
          step.status === "completed"
            ? "text-success"
            : step.status === "inProgress"
              ? "text-primary"
              : "text-muted-foreground/40",
        )}
      >
        {step.status === "completed" ? (
          <IconCheck className="size-3" />
        ) : step.status === "inProgress" ? (
          <IconPointFilled className="size-3" />
        ) : (
          <IconCircle className="size-2.5" />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1",
          step.status === "completed"
            ? "text-muted-foreground/55"
            : step.status === "inProgress"
              ? "text-foreground/90"
              : "text-muted-foreground/70",
        )}
      >
        {step.step}
      </span>
      <span className="ml-auto w-12 shrink-0 text-right text-[10px] text-muted-foreground/45 tabular-nums">
        {step.durationMs !== undefined
          ? formatTaskDuration(step.durationMs)
          : step.status === "inProgress"
            ? "now"
            : null}
      </span>
    </div>
  );
}

interface ComposerTasksPanelProps {
  /** Task-list rows for the live turn. Empty hides the panel. */
  steps: readonly ComposerTaskStep[];
  /**
   * Identifies the turn the steps belong to. Dismissal is scoped to it, so a
   * new turn brings the panel back. Undefined means "no live turn".
   */
  turnId?: string;
}

export function ComposerTasksPanel({ steps, turnId }: ComposerTasksPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedTurnId, setDismissedTurnId] = useState<string | null>(null);

  const turnKey = turnId ?? "current";
  const visible = steps.length > 0 && dismissedTurnId !== turnKey;
  const progress = visible ? deriveProgress(steps) : null;
  const allDone = progress
    ? progress.completedSteps >= progress.totalSteps
    : false;
  const label = progress
    ? `Tasks: ${progress.completedSteps} of ${progress.totalSteps} complete. Current task: ${progress.step}`
    : "Tasks";

  return (
    <AnimatePresence initial={false}>
      {visible && progress ? (
        <m.div
          key={turnKey}
          className="w-full rounded-b-none rounded-t-surface bg-muted/50"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={motionBase}
        >
          {/* Flush above the input card. The dock in ComposerStash owns the inset, so
              this fills its column; the squared bottom matches QueuedMessagesPanel so
              the stack reads as one surface. */}
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <div className="flex items-center gap-1 px-3 py-1.5">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={label}
                  className="motion-press flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch text-left text-xs leading-none text-muted-foreground hover:text-foreground active:scale-[0.98]"
                  // Keep composer focus when toggling from the input.
                  onPointerDown={(event) => event.preventDefault()}
                >
                  <IconListCheck aria-hidden className="size-3.5 shrink-0" />
                  <span className="shrink-0 font-medium text-foreground">
                    Tasks
                  </span>
                  {expanded ? null : (
                    <span className="min-w-0 flex-1 truncate text-foreground/80">
                      {progress.step}
                    </span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 font-medium tabular-nums",
                      expanded ? "ml-auto" : "",
                      allDone ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {progress.completedSteps}/{progress.totalSteps}
                  </span>
                  {expanded ? null : (
                    <TaskSegments className="w-20" steps={steps} />
                  )}
                </button>
              </CollapsibleTrigger>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Dismiss tasks for this turn"
                className="shrink-0"
                onClick={() => setDismissedTurnId(turnKey)}
                onPointerDown={(event) => event.preventDefault()}
              >
                <IconX aria-hidden className="size-3" />
              </Button>
            </div>
            <CollapsibleContent>
              <div className="space-y-px px-3 pb-3" role="list">
                {keyedTaskSteps(steps).map(({ key, step }) => (
                  <TaskStepRow key={key} step={step} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
