import type { SandboxDisplayStatus } from "@eva/shared";

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

