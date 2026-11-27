import type { ActivityStep } from "@vvedantb/ui";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";

/**
 * What the floating launcher's face shows. One at a time; `aveLogoState`
 * applies the priority error > done > waiting > tools > searching > thinking
 * > idle. `done` and `error` are one-shots the launcher clears itself.
 */
export type AveLogoState =
  | "idle"
  | "thinking"
  | "searching"
  | "tools"
  | "waiting"
  | "done"
  | "error";

/** Read by screen readers off the launcher; idle needs no description. */
export const AVE_STATE_LABEL: Record<AveLogoState, string | null> = {
  idle: null,
  thinking: "Manager Ave is thinking",
  searching: "Manager Ave is searching",
  tools: "Manager Ave is using tools",
  waiting: "Manager Ave is waiting for you",
  done: "Manager Ave finished",
  error: "Manager Ave hit an error",
};

const SEARCH_STEPS = new Set<ActivityStep["type"]>([
  "web_search",
  "web_fetch",
  "search_code",
  "search_files",
]);

/** Tool calls that are not a search. Prose, reasoning and notices are not tools. */
const TOOL_STEPS = new Set<ActivityStep["type"]>([
  "read",
  "edit",
  "write",
  "bash",
  "notebook",
  "subtask",
  "todos",
  "tool",
]);

/**
 * Derives the launcher state from Ave's thread, its live activity payload
 * (the `ActivityStep[]` JSON that `StreamingActivityDisplay` renders) and the
 * routed questions waiting on the user.
 *
 * Only `active` steps count: once a tool completes and no new step has begun,
 * the model is reasoning again, so a silent, empty or legacy plain-text
 * stream reads as thinking.
 */
export function aveLogoState({
  threadStatus,
  currentActivity,
  waitingCount,
  justFinished,
  lastRunErrored,
}: {
  threadStatus: "idle" | "running" | undefined;
  currentActivity: string | undefined;
  waitingCount: number | undefined;
  /** An observed running → idle edge whose one-shot has not cleared yet. */
  justFinished: boolean;
  /** The run that just finished ended on Ave's error alert row. */
  lastRunErrored: boolean;
}): AveLogoState {
  if (justFinished) return lastRunErrored ? "error" : "done";
  const active = (parseActivitySteps(currentActivity) ?? []).filter(
    (step) => step.status === "active",
  );
  const hasOpenQuestion = active.some((step) => step.type === "question");
  if (hasOpenQuestion || (waitingCount ?? 0) > 0) return "waiting";
  if (threadStatus !== "running") return "idle";
  if (active.some((step) => TOOL_STEPS.has(step.type))) return "tools";
  if (active.some((step) => SEARCH_STEPS.has(step.type))) return "searching";
  return "thinking";
}
