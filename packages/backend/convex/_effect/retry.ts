/**
 * The two retry shapes eva's action code actually uses, plus the runner that
 * makes an Effect pipeline safe to drop inside an existing `async` function.
 *
 * WHY THE RUNNER EXISTS
 * `Effect.runPromise` rejects with a `FiberFailure` wrapper, not with the value
 * the effect failed with. Every caller in this codebase catches errors and asks
 * questions about them — `instanceof SandboxProviderError`,
 * `message.includes("is not ahead of")`, `isRetryableGitNetworkError(...)` — so a
 * wrapper would silently reclassify every failure. `runPromiseRethrowing`
 * squashes the cause instead, which hands back the original error object
 * (failures and defects alike).
 */

import { Cause, Duration, Effect, Exit, Schedule } from "effect";

/**
 * Retries once per entry in `delaysMs`, waiting that entry before the retry it
 * precedes. `[]` never retries; `[0]` retries once immediately.
 */
export function retryAfterDelays(
  delaysMs: readonly number[],
): Schedule.Schedule<number> {
  return Schedule.recurs(delaysMs.length).pipe(
    Schedule.addDelay((recurrence) => Duration.millis(delaysMs[recurrence])),
  );
}

/**
 * `attempts` tries in total, waiting `stepMs`, `2 * stepMs`, … between them.
 */
export function retryLinearBackoff(
  attempts: number,
  stepMs: number,
): Schedule.Schedule<number> {
  return retryAfterDelays(
    Array.from(
      { length: Math.max(attempts - 1, 0) },
      (_, i) => stepMs * (i + 1),
    ),
  );
}

/**
 * Runs `effect` and rejects with its original failure value, so surrounding
 * `catch` blocks keep seeing the error the underlying call threw.
 */
export async function runPromiseRethrowing<A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
