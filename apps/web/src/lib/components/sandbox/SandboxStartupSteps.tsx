"use client";

import {
  CircleSpinner,
  cn,
  CrossfadeIconSlot,
  formatElapsed,
  Shimmer,
  useElapsedSeconds,
  type ActivityStep,
} from "@eva/ui";
import { IconCheck, IconX } from "@tabler/icons-react";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { SANDBOX_CHAT_COPY } from "@/lib/components/chat/chatBodyUtils";

/** "Fetching base branch..." → "Fetching base branch": the row icon carries the progress. */
function stageLabel(label: string): string {
  return label.replace(/(\.{3}|…)$/, "");
}

function StageIcon({ step }: { step: ActivityStep }) {
  const state = step.isError
    ? "failed"
    : step.status === "active"
      ? "running"
      : "done";
  return (
    <CrossfadeIconSlot
      iconKey={state}
      variant="soft"
      className="relative flex size-4 shrink-0 items-center justify-center"
    >
      {state === "running" ? (
        <CircleSpinner size="sm" className="size-3.5" />
      ) : state === "failed" ? (
        <IconX className="size-4" />
      ) : (
        <IconCheck className="size-4" />
      )}
    </CrossfadeIconSlot>
  );
}

/**
 * Sandbox startup as a header plus one row per stage (create, fetch, branch…),
 * modelled on t3code's worktree setup card. The header shimmers while the run
 * is live; finished stages keep a check so the reader sees how far it got.
 */
export function SandboxStartupSteps({
  activity,
  startedAt,
  title = SANDBOX_CHAT_COPY.startingTitle,
}: {
  activity: string | undefined;
  startedAt?: number;
  title?: string;
}) {
  const steps = parseActivitySteps(activity) ?? [];
  const elapsed = useElapsedSeconds(startedAt, true);

  return (
    <section aria-label="Sandbox startup" className="space-y-1.5">
      <div className="flex h-6 min-w-0 items-baseline gap-2 text-muted-foreground text-sm tabular-nums">
        <Shimmer
          as="span"
          duration={2.5}
          spread={1.5}
          className="min-w-0 truncate"
        >
          {title}
        </Shimmer>
        {startedAt ? (
          <span className="ml-auto shrink-0 text-xs">
            {formatElapsed(elapsed)}
          </span>
        ) : null}
      </div>
      {steps.length > 0 ? (
        <ul className="space-y-1">
          {steps.map((step, index) => {
            const label = stageLabel(step.label);
            const running = step.status === "active" && !step.isError;
            return (
              <li
                key={`${step.label}:${index}`}
                className={cn(
                  "flex min-w-0 items-center gap-2 text-sm",
                  step.isError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <StageIcon step={step} />
                <span className="min-w-0 truncate">
                  {running ? (
                    <Shimmer as="span" duration={2.5} spread={1.5}>
                      {label}
                    </Shimmer>
                  ) : (
                    label
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
