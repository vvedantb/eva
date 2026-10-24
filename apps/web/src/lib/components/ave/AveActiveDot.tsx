"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { cn } from "@eva/ui";
import {
  AVE_STATE_LABEL,
  type AveLogoState,
} from "@/lib/components/ave/aveLogoState";

/** The pip's corner, shared by the pip and its tools ripple. */
const PIP_SPOT = "absolute -right-0.5 -top-0.5 size-2.5 rounded-full";
const PIP_CLASS = cn(PIP_SPOT, "ring-2 ring-background");

/**
 * A "working" pip, not a count: there is only ever one Manager Ave, so the
 * question is "is it running a turn right now".
 *
 * Its own file because two summon buttons carry it — the floating launcher on
 * desktop and the mobile header button — and they must not drift apart.
 * Absolutely positioned against whichever button hosts it.
 */
export function AveActiveDot() {
  const thread = useQuery(api.ave.getThread, {});
  if (thread?.status !== "running") return null;
  return (
    <>
      <span className={cn(PIP_CLASS, "bg-success")} aria-hidden />
      <span className="sr-only">Manager Ave is working</span>
    </>
  );
}

const PIP_STATES = new Set<AveLogoState>([
  "thinking",
  "searching",
  "tools",
  "error",
]);

/**
 * The launcher's corner cue, driven by its face state instead of the thread
 * alone: green while a turn runs, red on an error, a check when one finishes.
 * Waiting has no pip — the halo and the questions badge carry it. The label
 * is what the launcher's `aria-describedby` points at.
 */
export function AveStatePip({
  state,
  labelId,
}: {
  state: AveLogoState;
  labelId: string;
}) {
  const label = AVE_STATE_LABEL[state];
  return (
    <>
      {state === "tools" && (
        <span className={cn(PIP_SPOT, "ave-ripple")} aria-hidden />
      )}
      {PIP_STATES.has(state) && (
        <span
          className={cn(
            PIP_CLASS,
            "ave-pip",
            state === "error" ? "bg-destructive" : "bg-success",
          )}
          aria-hidden
        />
      )}
      {state === "done" && (
        <span
          className="ave-check absolute -right-1 -top-1 size-[15px] rounded-full bg-success ring-2 ring-background"
          aria-hidden
        >
          <svg viewBox="-7.5 -7.5 15 15" className="size-full">
            <path
              className="ave-check-path"
              d="M-3.4 0.2L-0.9 2.8L3.4 -2.3"
              pathLength={1}
              strokeDasharray={1}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {label === null ? null : (
        <span id={labelId} className="sr-only">
          {label}
        </span>
      )}
    </>
  );
}
