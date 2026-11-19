import { cn } from "@eva/ui";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  tokenTransition,
} from "@vvedantb/ui";
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
import {
  COMPOSER_TASK_NOW,
  COMPOSER_TASKS_DISMISS_LABEL,
  COMPOSER_TASKS_TITLE,
  composerTaskProgress,
  composerTaskSteps,
  composerTasksLabel,
  keyedComposerTaskSteps,
  type ComposerTaskStep,
} from "@eva/shared/composerTasks";

export type { ComposerTaskStep };
type TaskStatus = ComposerTaskStep["status"];

/** Every status's look in one place; a new status fails the type check here. */
const TASK_STATUS_STYLE: Record<
  TaskStatus,
  {
    readonly segment: string;
    readonly icon: string;
    readonly text: string;
    readonly Icon: typeof IconCheck;
    readonly iconSize: string;
    readonly trailing: string | null;
  }
> = {
  completed: {
    segment: "bg-success",
    icon: "text-success",
    text: "text-muted-foreground/55",
    Icon: IconCheck,
    iconSize: "size-3",
    trailing: null,
  },
  in_progress: {
    segment: "bg-primary",
    icon: "text-primary",
    text: "text-foreground/90",
    Icon: IconPointFilled,
    iconSize: "size-3",
    trailing: COMPOSER_TASK_NOW,
  },
  pending: {
    segment: "bg-muted-foreground/25",
    icon: "text-muted-foreground/40",
    text: "text-muted-foreground/70",
    Icon: IconCircle,
    iconSize: "size-2.5",
    trailing: null,
  },
};

/** Reads the live turn's todo snapshot out of the streaming activity payload. */
export function composerTaskStepsFromActivity(
  activity: string | undefined,
): readonly ComposerTaskStep[] {
  return composerTaskSteps(parseActivitySteps(activity));
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
      {keyedComposerTaskSteps(steps).map(({ key, step }) => (
        <span
          key={key}
          className={cn(
            "h-[3px] min-w-0 flex-1 rounded-full",
            TASK_STATUS_STYLE[step.status].segment,
          )}
        />
      ))}
    </span>
  );
}

function TaskStepRow({ step }: { readonly step: ComposerTaskStep }) {
  const style = TASK_STATUS_STYLE[step.status];
  return (
    <div className="flex items-center gap-2 text-xs leading-5" role="listitem">
      <span
        aria-hidden
        className={cn(
          "flex w-3 shrink-0 items-center justify-center",
          style.icon,
        )}
      >
        <style.Icon className={style.iconSize} />
      </span>
      <span className={cn("min-w-0 flex-1", style.text)}>{step.content}</span>
      <span className="ml-auto w-12 shrink-0 text-right text-3xs text-muted-foreground/45 tabular-nums">
        {style.trailing}
      </span>
    </div>
  );
}

interface ComposerTasksPanelProps {
  /** Task-list rows for the live turn. Empty hides the panel. */
  steps: readonly ComposerTaskStep[];
  /**
   * Identifies the turn the steps belong to. Dismissal is scoped to it, so a
   * new turn brings the panel back. Undefined means "no live turn": no panel.
   */
  turnId?: string;
}

export function ComposerTasksPanel({ steps, turnId }: ComposerTasksPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedTurnId, setDismissedTurnId] = useState<string | null>(null);

  const progress =
    turnId !== undefined && dismissedTurnId !== turnId
      ? composerTaskProgress(steps)
      : null;
  const label = progress ? composerTasksLabel(progress) : COMPOSER_TASKS_TITLE;

  return (
    <AnimatePresence initial={false}>
      {progress && turnId !== undefined ? (
        <m.div
          key={turnId}
          className="w-full rounded-b-none rounded-t-surface bg-muted/50"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={tokenTransition.base}
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
                    {COMPOSER_TASKS_TITLE}
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
                      progress.allDone ? "text-success" : "text-muted-foreground",
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
                aria-label={COMPOSER_TASKS_DISMISS_LABEL}
                className="shrink-0"
                onClick={() => setDismissedTurnId(turnId)}
                onPointerDown={(event) => event.preventDefault()}
              >
                <IconX aria-hidden className="size-3" />
              </Button>
            </div>
            <CollapsibleContent>
              <div className="space-y-px px-3 pb-3" role="list">
                {keyedComposerTaskSteps(steps).map(({ key, step }) => (
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
