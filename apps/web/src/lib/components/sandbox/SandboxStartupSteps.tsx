"use client";

import {
  CircleSpinner,
  formatElapsed,
  Shimmer,
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
  useElapsedSeconds,
  type ActivityStep,
  type TraceStatus,
} from "@eva/ui";
import { IconCheck, IconCircle, IconX } from "@tabler/icons-react";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { SANDBOX_CHAT_COPY } from "@/lib/components/chat/chatBodyUtils";

/** "Fetching base branch..." → "Fetching base branch": the row icon carries the progress. */
function stageLabel(label: string): string {
  return label.replace(/(\.{3}|…)$/, "");
}

type StageState = "pending" | "running" | "failed" | "done";

function stageState(step: ActivityStep): StageState {
  if (step.isError) return "failed";
  if (step.status === "active") return "running";
  if (step.status === "pending") return "pending";
  return "done";
}

const STAGE_TRACE_STATUS: Record<StageState, TraceStatus | undefined> = {
  pending: "pending",
  running: "running",
  failed: "error",
  done: undefined,
};

function StageIcon({ state }: { state: StageState }) {
  if (state === "running") return <CircleSpinner size="sm" className="size-3.5" />;
  if (state === "failed") return <IconX />;
  if (state === "pending") return <IconCircle className="size-3.5" />;
  return <IconCheck />;
}

/**
 * Sandbox startup as a header plus one row per stage (create, fetch, branch…),
 * modelled on t3code's worktree setup card. The header shimmers while the run
 * is live; finished stages keep a check so the reader sees how far it got, and
 * planned stages show faded so the reader sees what is left.
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
        <Trace>
          {steps.map((step, index) => {
            const state = stageState(step);
            return (
              <TraceLine
                key={`${step.label}:${index}`}
                status={STAGE_TRACE_STATUS[state]}
              >
                <TraceIcon iconKey={state}>
                  <StageIcon state={state} />
                </TraceIcon>
                <TraceTitle shimmer={state === "running"}>
                  {stageLabel(step.label)}
                </TraceTitle>
              </TraceLine>
            );
          })}
        </Trace>
      ) : null}
    </section>
  );
}
