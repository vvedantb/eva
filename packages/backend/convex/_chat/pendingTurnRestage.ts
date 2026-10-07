/**
 * The guard that stops the task/project chat workflow from re-staging a prompt
 * the daemon is already running.
 *
 * `startExecute` stages `pendingTurn`, the warm daemon claims it (clearing the
 * field), and the execute workflow then calls `ensurePendingTurn` to cover the
 * one case where a cancel raced `startExecute` and wiped the prompt before any
 * daemon saw it. Both states look identical from the doc alone: no
 * `pendingTurn`, and the newest message is an unfinished non-synthetic
 * assistant placeholder. So the re-stage fired mid-turn too, leaving a
 * duplicate prompt parked in `pendingTurn` for the whole turn.
 *
 * That duplicate is live ammunition, because `shouldDeferDaemonRespawn`
 * deliberately does not defer while a prompt is staged: in prod (task
 * m57bzd0wbdtnm57e2g4jfb17718b5yty, 2026-09-02 13:11) a prewarm killed the
 * daemon mid-turn, the replacement claimed the duplicate, and the same prompt
 * ran twice in parallel — two `handleCompletion` calls for one user message.
 *
 * Sessions never had this bug: their `ensurePendingTurn` consults the durable
 * `turns` row (`state === "running"` → do not re-stage). Tasks and projects
 * have no such row, so `pendingTurnClaimedAt` is their claim stamp instead.
 */

/**
 * Whether the prompt is gone from `pendingTurn` because a daemon claimed it
 * and is running it right now, rather than because a cancel wiped it.
 *
 * The placeholder message for THIS turn is inserted by `startExecute`, before
 * any daemon can claim, so a claim stamp at or after the placeholder belongs
 * to this turn. A stale stamp from an older turn is harmless: the new turn's
 * placeholder is newer than it, so this returns false and the cancel-race
 * re-stage still works.
 */
export function pendingTurnAlreadyClaimed(input: {
  pendingTurnClaimedAt: number | undefined;
  placeholderTimestamp: number;
}): boolean {
  return (
    input.pendingTurnClaimedAt !== undefined &&
    input.pendingTurnClaimedAt >= input.placeholderTimestamp
  );
}
