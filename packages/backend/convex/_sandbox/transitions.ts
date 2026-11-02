import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
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

/**
 * Each request that moves a sandbox to `starting` bumps
 * `sandboxStartAttempt` and hands the new number to its start action. The
 * action's ready / failure writes carry it back, so a slower, older attempt
 * cannot close or re-point a sandbox that a newer attempt now owns.
 */
export function nextSandboxStartAttempt(current: number | undefined): number {
  return (current ?? 0) + 1;
}

/**
 * `attempt` is undefined for starts that carry no token: the first boot of a
 * new session, internal starts such as the project interview, and jobs
 * scheduled before the token existed. Those keep the status-only rules above.
 */
export function isCurrentSandboxStartAttempt(
  current: number | undefined,
  attempt: number | undefined,
): boolean {
  return attempt === undefined || attempt === current;
}

/**
 * A stale attempt's ready / allocated write is ignored, so a VM that only that
 * attempt created would keep running with nothing tracking it. Delete it when
 * the row tracks a different VM. A shared id (both attempts resuming the same
 * VM) or an untracked row is left alone.
 */
export async function discardStaleAttemptSandbox(
  ctx: MutationCtx,
  args: {
    sandboxId: string;
    trackedSandboxId: string | undefined;
    repoId: Id<"githubRepos"> | undefined;
  },
): Promise<void> {
  if (
    args.repoId === undefined ||
    args.trackedSandboxId === undefined ||
    args.sandboxId === args.trackedSandboxId
  ) {
    return;
  }
  console.log(
    `[sandbox] deleting stale-attempt sandbox ${args.sandboxId} (tracked ${args.trackedSandboxId})`,
  );
  await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
    sandboxId: args.sandboxId,
    repoId: args.repoId,
  });
}
