/**
 * Turn length limits shared by the sandbox daemon (callback-src) and Convex.
 * Keep them here so the daemon cap and the Convex backstops cannot drift apart.
 */

/** Daemon cap on one agent turn. Long prompts (load tests, profiling) need hours. */
export const TURN_MAX_RUNTIME_MS = 3 * 60 * 60 * 1000;

/**
 * Convex backstop for a turn whose daemon died without reporting. It must sit
 * above `TURN_MAX_RUNTIME_MS`, so the daemon always ends a live turn first and
 * reports a clear error.
 */
export const TURN_BACKSTOP_MS = TURN_MAX_RUNTIME_MS + 30 * 60 * 1000;

const TURN_MAX_RUNTIME_HOURS = TURN_MAX_RUNTIME_MS / 3_600_000;

/** Error Convex stores when a turn reaches `TURN_BACKSTOP_MS`. */
export const TURN_BACKSTOP_ERROR = `Turn exceeded the ${TURN_BACKSTOP_MS / 3_600_000}-hour limit`;

/** Error the warm daemons report when a turn reaches `TURN_MAX_RUNTIME_MS`. */
export const TURN_MAX_RUNTIME_ERROR =
  "The assistant exceeded the maximum turn runtime.";

/** The SDK runners' wording for the same cap (`buildErrorMessage`). */
export const ATTEMPT_MAX_RUNTIME_ERROR_FRAGMENT = "terminated after max runtime of";

/** Whether a failed turn's error (or its "Error: …" bubble) is the runtime cap. */
export function isTurnMaxRuntimeError(text: string): boolean {
  return (
    text.includes(TURN_MAX_RUNTIME_ERROR) ||
    text.includes(ATTEMPT_MAX_RUNTIME_ERROR_FRAGMENT)
  );
}

/** User bubble for the one automatic continue after a runtime-cap failure. */
export const TURN_CONTINUE_DISPLAY = `Continue: the last turn hit the ${TURN_MAX_RUNTIME_HOURS}-hour limit.`;

/** What the agent receives for that continue. */
export const TURN_CONTINUE_PROMPT = `Your last turn reached the ${TURN_MAX_RUNTIME_HOURS}-hour runtime limit and was stopped. Eva committed your work at that point. Check git status and git log, then continue the task from where you stopped. Do not repeat finished steps. If a step is very long (a benchmark or load test), run it in the background and check on it, so one turn does not hit the limit again.`;
