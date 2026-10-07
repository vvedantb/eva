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

export type SandboxStatus = "active" | "starting" | "stopping" | "closed";

/** Backend statuses plus the client-derived "a wake attempt failed" state. */
export type SandboxDisplayStatus = SandboxStatus | "error";

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
 * A sandbox whose start failed is left `closed` with the reason on the row, so
 * on status alone it is indistinguishable from one the user put to sleep. Pair
 * the two fields to tell them apart.
 */
export function sandboxDisplayStatus(session: {
  status: SandboxStatus;
  sandboxError?: string;
}): SandboxDisplayStatus {
  if (session.status === "closed" && (session.sandboxError ?? "") !== "") {
    return "error";
  }
  return session.status;
}
