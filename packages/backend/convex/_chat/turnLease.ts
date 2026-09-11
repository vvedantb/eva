import { RUN_TIMEOUT_MS } from "../_taskWorkflow/staleness";
import type { TurnState } from "../validators";

export type TerminalTurnState = "done" | "error" | "cancelled";

export const TURN_STARTUP_LEASE_MS = 15 * 60 * 1000;
export const TURN_RUNNING_LEASE_MS = 2 * 60 * 1000;
export const TURN_FINALIZING_LEASE_MS = 10 * 60 * 1000;

/**
 * How long an expired lease is tolerated while the sandbox probe still reports
 * the agent process alive (or the probe itself is unreachable) before the turn
 * is finalised anyway. A frozen-but-alive daemon — a VM swapping hard under
 * parallel sub agents — used to lose its turn the moment its 2-minute lease
 * lapsed. The absolute 2h `RUN_TIMEOUT_MS` cap still applies via
 * `turnLeaseExpiry`, so grace can never extend a turn past it.
 */
export const TURN_SILENT_ALIVE_GRACE_MS = 10 * 60 * 1000;

export type ExpiredTurnLeaseCause =
  | "sandbox_stopped"
  | "process_dead"
  | "silent_timeout";

export type ExpiredTurnLeaseDecision =
  | { action: "grace" }
  | { action: "finalize"; cause: ExpiredTurnLeaseCause };

/**
 * Decides what the lease reconciler does with one open turn whose lease
 * expired. A confirmed-dead (or unprobeable-because-absent) sandbox is
 * finalised immediately; a process the probe still sees running is granted
 * grace until it has been silent for `TURN_SILENT_ALIVE_GRACE_MS`.
 *
 * `liveness === null` means the turn has no sandbox to probe, so nothing can
 * still be running for it.
 */
export function expiredTurnLeaseDecision(input: {
  liveness: { alive: boolean; reason: string } | null;
  silentSince: number | undefined;
  now: number;
}): ExpiredTurnLeaseDecision {
  if (input.liveness === null) {
    return { action: "finalize", cause: "process_dead" };
  }
  if (input.liveness.reason === "sandbox_not_started") {
    return { action: "finalize", cause: "sandbox_stopped" };
  }
  if (!input.liveness.alive) {
    return { action: "finalize", cause: "process_dead" };
  }
  // Alive, or the probe could not reach the sandbox to say otherwise — both
  // get grace, bounded so a permanently wedged process still settles.
  if (
    input.silentSince !== undefined &&
    input.now - input.silentSince >= TURN_SILENT_ALIVE_GRACE_MS
  ) {
    return { action: "finalize", cause: "silent_timeout" };
  }
  return { action: "grace" };
}

export function isTerminalTurnState(
  state: TurnState,
): state is TerminalTurnState {
  return state === "done" || state === "error" || state === "cancelled";
}

export function canTransitionTurn(from: TurnState, to: TurnState): boolean {
  switch (from) {
    case "staged":
      return true;
    case "launching":
      return (
        to === "launching" ||
        to === "running" ||
        to === "finalizing" ||
        isTerminalTurnState(to)
      );
    case "running":
      return (
        to === "running" ||
        to === "finalizing" ||
        isTerminalTurnState(to)
      );
    case "finalizing":
      return to === "finalizing" || isTerminalTurnState(to);
    case "done":
    case "error":
    case "cancelled":
      return false;
  }
}

export function turnLeaseDurationMs(state: TurnState): number {
  switch (state) {
    case "staged":
    case "launching":
      return TURN_STARTUP_LEASE_MS;
    case "running":
      return TURN_RUNNING_LEASE_MS;
    case "finalizing":
      return TURN_FINALIZING_LEASE_MS;
    case "done":
    case "error":
    case "cancelled":
      return 0;
  }
}

export function turnLeaseExpiry(input: {
  state: TurnState;
  turnStartedAt: number;
  now: number;
}): number {
  return Math.min(
    input.now + turnLeaseDurationMs(input.state),
    input.turnStartedAt + RUN_TIMEOUT_MS,
  );
}

export function turnExceededAbsoluteLimit(
  turnStartedAt: number,
  now: number,
): boolean {
  return now >= turnStartedAt + RUN_TIMEOUT_MS;
}

/**
 * Heartbeats used to patch `leaseExpiresAt` on every flush (~150ms while
 * tokens stream). The running lease is two minutes; writing it every flush
 * only created OCC with overlapping heartbeats. Renew when the phase
 * changed or less than half the lease remains.
 */
export function shouldWriteTurnLeaseRenewal(input: {
  currentState: TurnState;
  nextState: TurnState;
  leaseExpiresAt: number;
  now: number;
  durationMs: number;
}): boolean {
  if (input.currentState !== input.nextState) return true;
  if (input.durationMs <= 0) return true;
  return input.leaseExpiresAt - input.now <= input.durationMs / 2;
}
