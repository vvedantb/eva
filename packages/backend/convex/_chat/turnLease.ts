import { RUN_TIMEOUT_MS } from "../_taskWorkflow/staleness";
import type { TurnState } from "../validators";

export type TerminalTurnState = "done" | "error" | "cancelled";

export const TURN_STARTUP_LEASE_MS = 15 * 60 * 1000;
export const TURN_RUNNING_LEASE_MS = 2 * 60 * 1000;
export const TURN_FINALIZING_LEASE_MS = 10 * 60 * 1000;

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

/** Heartbeat row is missing or older than the running-turn lease. */
export function isStreamingActivityStale(
  streaming: { lastUpdatedAt?: number } | null,
  now = Date.now(),
): boolean {
  return (
    streaming === null ||
    now - (streaming.lastUpdatedAt ?? 0) > TURN_RUNNING_LEASE_MS
  );
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
