
/**
 * Shared visual styles for the sandbox status dot — used by the session sidebar
 * item, list/kanban cards, and the Task/Project surface tabs. Each state maps
 * to a tailwind class for the dot and a human label for the tooltip / `title`.
 *
 * Labels speak the same wake/sleep metaphor as the controls ("Wake up Eva" /
 * "Put Eva to sleep"): a sandbox is Awake, Waking up, Going to sleep or Asleep,
 * never "Running" / "Stopped". `error` is a display-only state derived by
 * {@link sandboxDisplayStatus} — the backend has no such status.
 */

import type { SandboxDisplayStatus } from "@eva/shared";

// Moved to `@eva/shared` so the phone's wake control reads the same states.
export {
  sandboxDisplayStatus,
  type SandboxDisplayStatus,
  type SandboxStatus,
} from "@eva/shared";

export const SANDBOX_STATUS_STYLES: Record<
  SandboxDisplayStatus,
  { dot: string; label: string }
> = {
  active: {
    dot: "bg-emerald-500",
    label: "Awake",
  },
  starting: {
    dot: "bg-amber-400",
    label: "Waking up",
  },
  stopping: {
    dot: "bg-amber-400",
    label: "Going to sleep",
  },
  closed: {
    dot: "bg-muted-foreground/40",
    label: "Asleep",
  },
  error: {
    dot: "bg-destructive",
    label: "Couldn't wake up",
  },
};

/**
 * Simple view wakes the sandbox from the Preview tab, so the dot only shows
 * when the user must act: a failed wake. Full view always shows it.
 */
export function showsSandboxStatusDot(
  status: SandboxDisplayStatus,
  simpleView: boolean,
): boolean {
  return !simpleView || status === "error";
}

