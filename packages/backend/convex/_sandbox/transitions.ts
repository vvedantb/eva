import type { Infer } from "convex/values";
import type { sessionStatusValidator } from "../_validators/enums";
import { isSandboxClosingStatus } from "./closingStatus";

/**
 * Sandbox lifecycle shared by sessions (`status`), tasks
 * (`reviewTaskSandboxStatus`) and projects (`reviewProjectSandboxStatus`):
 *
 *   closed ──start──▶ starting ──ready──▶ active ──stop──▶ stopping ──settled──▶ closed
 *                        └──────failure──────▶ closed
 *
 * Tasks and projects use `undefined` for "never started", which behaves as
 * `closed`. These guards are the only rules for leaving a state; every writer
 * that moves a sandbox into `starting` or out of it on failure asks here first.
 */
export type SandboxStatus = Infer<typeof sessionStatusValidator> | undefined;

/**
 * A user or queue wake may (re)start from anything except `stopping`. While a
 * stop is in flight its finalize still kills the VM, and `markSandboxClosed`
 * only settles a row that is still `stopping` — flipping to `starting` here
 * would skip the stop divider and the post-stop queue drain. The drain wakes
 * the sandbox again once the stop settles, so queued sends are not lost.
 *
 * `starting → starting` stays allowed: pressing Start again is the only way
 * out of a start whose action died.
 */
export function canRequestSandboxStart(status: SandboxStatus): boolean {
  return status !== "stopping";
}

/**
 * An in-flight start action re-marking itself `starting` (or recording the VM
 * it allocated) must not revive a row the user stopped meanwhile — the action
 * polls for `stopping`/`closed` to abort, and overwriting it defeats that.
 */
export function canStartActionMarkStarting(status: SandboxStatus): boolean {
  return !isSandboxClosingStatus(status);
}

/**
 * A start failure only owns the row while it is still `starting`. Otherwise a
 * newer attempt is `active`, or a stop already owns the outcome — closing
 * there would hide a live VM or post a false "Failed to start sandbox".
 */
export function shouldApplySandboxStartFailure(status: SandboxStatus): boolean {
  return status === "starting";
}
