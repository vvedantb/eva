import type { Doc } from "@eva/backend";

/** A session's sandbox lifecycle (the backend `status`). */
export type SandboxStatus = Doc<"sessions">["status"];

/** Backend statuses plus the client-derived "a wake attempt failed" state. */
export type SandboxDisplayStatus = SandboxStatus | "error";

/**
 * A failed start leaves the session `closed` with its `sandboxError` set, which
 * on its own reads as a sandbox the user put to sleep: that pair is "error".
 */
export function sandboxDisplayStatus(session: { status: SandboxStatus; sandboxError?: string }): SandboxDisplayStatus {
  if (session.status === "closed" && (session.sandboxError ?? "") !== "") return "error";
  return session.status;
}

/** The sandbox control's labels, web and phone. */
export const SLEEP_EVA_LABEL = "Put Eva to sleep";
export const WAKE_EVA_LABEL = "Wake up Eva";
export const WAKE_EVA_RETRY_LABEL = "Try waking Eva again";

/**
 * Putting the sandbox to sleep mid-turn does not cancel the turn: the daemon
 * dies with the VM, the workflow keeps waiting, and the chat sits on "Working…"
 * until the stall watchdog kills it 5–25 minutes later with an alert that blames
 * a runtime limit rather than the button that was pressed. The composer's "Stop
 * Eva" is present in exactly that window and cancels properly.
 *
 * The control used to be removed outright in that state, which read as a bug —
 * the header lost a button mid-turn and grew it back. It now stays put, inert,
 * and says why.
 */
export const MID_TURN_SLEEP_HINT = "Eva is working — use Stop Eva in the composer first";
