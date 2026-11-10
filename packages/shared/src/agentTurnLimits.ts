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
