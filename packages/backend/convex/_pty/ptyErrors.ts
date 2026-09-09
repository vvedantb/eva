/**
 * The one terminal failure the user can do something about.
 *
 * Opening a terminal against a stopping/closed sandbox is refused on purpose
 * (see `ResolvedOwner.isStoppingOrClosed` in `./owners`), but the refusal used
 * to throw a plain `Error`, which production Convex redacts to "Server Error" —
 * the terminal showed a shrug where it should have said "start the sandbox". As
 * a tagged error it travels on `ConvexError.data` instead.
 */

import { Data, Effect } from "effect";

export class SandboxNotRunning extends Data.TaggedError("SandboxNotRunning")<{
  message: string;
}> {}

/** The exact text the terminal has always shown for this refusal. */
export const SANDBOX_NOT_RUNNING_MESSAGE =
  "Sandbox is not running. Start the sandbox first.";

/**
 * Passes a resolved owner through, or fails when its sandbox is stopping or
 * closed. Generic over the owner so this module stays a leaf: it must not pull
 * in the Convex context that resolving an owner needs.
 */
export function requireRunningSandbox<
  T extends { readonly isStoppingOrClosed: boolean },
>(owner: T): Effect.Effect<T, SandboxNotRunning> {
  return owner.isStoppingOrClosed
    ? Effect.fail(
        new SandboxNotRunning({ message: SANDBOX_NOT_RUNNING_MESSAGE }),
      )
    : Effect.succeed(owner);
}
