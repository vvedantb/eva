import { v, type Infer } from "convex/values";
import { sandboxPausedAlertText, SANDBOX_STOPPED_ALERT } from "@eva/shared";

/**
 * Why a sandbox stop was requested. Threaded from the stop request through the
 * finalize action to `mark*SandboxClosed`, which inserts the chat divider — so
 * an idle pause reads differently from a manual Stop. Absent = manual/other.
 */
export const stopReasonValidator = v.optional(
  v.object({
    kind: v.literal("idle"),
    idleMinutes: v.number(),
  }),
);

export type StopReason = Infer<typeof stopReasonValidator>;

/** Chat-divider text for a settled stop. */
export function stopAlertText(reason: StopReason): string {
  if (reason?.kind === "idle") return sandboxPausedAlertText(reason.idleMinutes);
  return SANDBOX_STOPPED_ALERT;
}
