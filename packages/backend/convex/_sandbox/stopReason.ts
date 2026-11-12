import { v, type Infer } from "convex/values";
import { sandboxPausedAlertText, SANDBOX_STOPPED_ALERT } from "@eva/shared";

/**
 * Why a sandbox stop was requested. Threaded from the stop request through the
 * finalize action to `mark*SandboxClosed`, which inserts the chat divider — so
 * an idle pause reads differently from a manual Stop. Absent = manual/other.
 */
export const stopReasonValidator = v.optional(
  v.union(
    v.object({
      kind: v.literal("idle"),
      idleMinutes: v.number(),
    }),
    /** The quick task, not a person, stopped its session (run end, retire). */
    v.object({ kind: v.literal("task") }),
  ),
);

export type StopReason = Infer<typeof stopReasonValidator>;

/**
 * Whether the settled stop posts a chat divider. A task run's own stop does
 * not: the run already reads as one finished turn, and the old task sandbox
 * stopped silently after every run.
 */
export function stopPostsDivider(reason: StopReason): boolean {
  return reason?.kind !== "task";
}

/** Chat-divider text for a settled stop. */
export function stopAlertText(reason: StopReason): string {
  if (reason?.kind === "idle") return sandboxPausedAlertText(reason.idleMinutes);
  return SANDBOX_STOPPED_ALERT;
}
