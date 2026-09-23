/**
 * Whether a session is still waiting on a turn no daemon can claim.
 *
 * A cancel arriving while `startExecute` was staging the turn wiped
 * `pendingTurn` after the workflow had already begun waiting on
 * `sessionComplete`, so the daemon polled an empty session forever and the chat
 * sat on an open bubble until the stale handler fired. Both recovery paths —
 * the in-workflow re-stage and the ops re-stage — hinge on this one question,
 * and each of its four conditions has its own way of going wrong, so it lives
 * here where it can be tested directly.
 */

/** Only the fields the decision reads; the real message docs carry many more. */
type OpenTurnCandidate = {
  role: string;
  finishedAt?: number;
  isSyntheticTurn?: boolean;
};

/**
 * Whether the staged `pendingTurn` still belongs to the turn being staged for.
 *
 * `pendingTurn` is the handoff slot for exactly one turn, and only two things
 * empty it: `claimPendingTurn` when a daemon takes it, and `saveResult` for the
 * turn whose `requestedAt` it carries. Neither runs when a turn dies before any
 * daemon claims it, so the slot outlives its turn — and because
 * {@link isUnclaimedOpenTurn} treated a full slot as "already staged", every
 * later turn was then refused a prompt. Those turns opened, were never claimed
 * (`leaseGeneration` 0), and the watchdog stalled each one out ~15 minutes
 * later, forever: Manager Ave sat on one orphan from 27 Aug and answered
 * nothing but "Turn stalled" for weeks.
 *
 * An orphan is recognisable without a clock: a slot staged for some other turn
 * can never be claimed against this one.
 */
export function isPendingTurnLive(params: {
  /** `turnId` of the slot, absent when nothing is staged. */
  pendingTurn: { turnId?: string } | undefined;
  /** The session's open durable turn; absent on legacy (pre-durable) sessions. */
  openTurnId: string | undefined;
}): boolean {
  if (params.pendingTurn === undefined) return false;
  // No durable turn to belong to — the slot is the only record of the turn.
  if (params.openTurnId === undefined) return true;
  return params.pendingTurn.turnId === params.openTurnId;
}

export function isUnclaimedOpenTurn(params: {
  /** Re-staging over a live pendingTurn would run the turn twice. */
  hasPendingTurn: boolean;
  /**
   * The assistant bubble the turn would be recovered for. Undefined when the
   * newest message is not an assistant row at all — nothing is waiting.
   */
  lastAssistant: OpenTurnCandidate | undefined | null;
}): boolean {
  const { hasPendingTurn, lastAssistant } = params;
  if (hasPendingTurn) return false;
  if (!lastAssistant) return false;
  if (lastAssistant.role !== "assistant") return false;
  // A finished bubble already has its reply; re-staging duplicates it.
  if (lastAssistant.finishedAt !== undefined) return false;
  // Synthetic turns are the daemon's own continuations. Re-staging one only
  // spams a leftover daemon with claimPendingTurn mismatches.
  if (lastAssistant.isSyntheticTurn === true) return false;
  return true;
}
