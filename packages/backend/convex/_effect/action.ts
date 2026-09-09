/**
 * The runner that lets a Convex action's typed failures reach the browser.
 *
 * WHY THIS EXISTS
 * Production Convex redacts a thrown `Error` to "Server Error" before it leaves
 * the deployment; only `ConvexError.data` crosses the wire. So an action whose
 * outcome the user has to act on — "Invalid pull request URL", "branch is not
 * ahead of main" — has to fail with a `ConvexError` carrying a structured
 * payload. {@link runActionEffect} is the one place that translation happens.
 *
 * FAIL VS DIE
 * A **Fail** is an expected outcome the pipeline declared in its error channel:
 * it is logged and rethrown as a `ConvexError` whose data is
 * {@link ConvexErrorPayload}, so the web can branch on `tag` instead of matching
 * message text. A **Die** (a defect — a thrown `TypeError`, a bug) or an
 * interrupt is rethrown unchanged via `Cause.squash`, which means Convex still
 * redacts it to "Server Error". That is correct: a defect is not a user-facing
 * outcome and its message may say more about eva's internals than the user
 * should see. Make a failure visible by putting it in the error channel.
 *
 * WHY A RUNNER AND NOT AN `effectAction` WRAPPER
 * A `customAction`-based wrapper would have to re-declare the auth context that
 * `authAction` already builds, and convex-helpers' generics make composing two
 * custom actions painful. A plain runner drops inside any existing `action` /
 * `authAction` handler body, so the auth story and the argument validators stay
 * exactly where they are.
 */

import { ConvexError } from "convex/values";
import { Cause, Data, Effect, Exit, Option } from "effect";
import type { ConvexErrorPayload } from "@eva/shared/convexErrorPayload";

/**
 * What the runner needs from an error channel: the discriminant to send as
 * `tag`, and the text to show. Every `Data.TaggedError` with a `message` prop
 * satisfies it.
 */
export type TaggedFailure = { readonly _tag: string; readonly message: string };

/**
 * The catch-all for a failure an action wants visible but has no classifier
 * for. Keeps the original as `cause` so the log line and any rethrow can reach
 * it.
 */
export class UnexpectedActionFailure extends Data.TaggedError(
  "UnexpectedActionFailure",
)<{ message: string; cause: unknown }> {}

/**
 * Runs `effect` inside a Convex action, turning its typed failures into
 * `ConvexError`s the client can read. `label` prefixes the server log line, so
 * make it identify the call (`createTaskPr task=<id>`).
 */
export async function runActionEffect<A, E extends TaggedFailure>(
  effect: Effect.Effect<A, E>,
  label: string,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;

  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) {
    // Defect or interrupt: hand back the original object, redaction included.
    throw Cause.squash(exit.cause);
  }

  // The rethrow drops the stack, so the original is logged first.
  console.error(`[${label}] ${failure.value._tag}: ${failure.value.message}`);
  throw new ConvexError({
    tag: failure.value._tag,
    message: failure.value.message,
  } satisfies ConvexErrorPayload);
}
