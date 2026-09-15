import { describe, expect, test } from "vitest";
import {
  TURN_FINALIZING_LEASE_MS,
  TURN_RUNNING_LEASE_MS,
  TURN_SILENT_ALIVE_GRACE_MS,
  TURN_STARTUP_LEASE_MS,
  canTransitionTurn,
  expiredTurnLeaseDecision,
  isTerminalTurnState,
  shouldWriteTurnLeaseRenewal,
  turnExceededAbsoluteLimit,
  turnLeaseDurationMs,
  turnLeaseExpiry,
} from "../convex/_chat/turnLease";
import { RUN_TIMEOUT_MS } from "../convex/_taskWorkflow/staleness";

const STARTED_AT = 1_800_000_000_000;

describe("durable turn lifecycle", () => {
  test("allows forward progress and terminal settlement", () => {
    expect(canTransitionTurn("staged", "launching")).toBe(true);
    expect(canTransitionTurn("launching", "running")).toBe(true);
    expect(canTransitionTurn("running", "finalizing")).toBe(true);
    expect(canTransitionTurn("finalizing", "done")).toBe(true);
    expect(canTransitionTurn("running", "error")).toBe(true);
    expect(canTransitionTurn("staged", "cancelled")).toBe(true);
  });

  test("rejects regressions and reopening terminal turns", () => {
    expect(canTransitionTurn("running", "launching")).toBe(false);
    expect(canTransitionTurn("finalizing", "running")).toBe(false);
    expect(canTransitionTurn("done", "running")).toBe(false);
    expect(canTransitionTurn("error", "staged")).toBe(false);
    expect(canTransitionTurn("cancelled", "running")).toBe(false);
  });

  test("classifies every terminal state", () => {
    expect(isTerminalTurnState("done")).toBe(true);
    expect(isTerminalTurnState("error")).toBe(true);
    expect(isTerminalTurnState("cancelled")).toBe(true);
    expect(isTerminalTurnState("running")).toBe(false);
  });

  test("uses phase-specific renewable leases", () => {
    expect(turnLeaseDurationMs("staged")).toBe(TURN_STARTUP_LEASE_MS);
    expect(turnLeaseDurationMs("launching")).toBe(TURN_STARTUP_LEASE_MS);
    expect(turnLeaseDurationMs("running")).toBe(TURN_RUNNING_LEASE_MS);
    expect(turnLeaseDurationMs("finalizing")).toBe(
      TURN_FINALIZING_LEASE_MS,
    );
    expect(turnLeaseDurationMs("done")).toBe(0);
  });

  test("never renews beyond the absolute turn deadline", () => {
    const nearDeadline = STARTED_AT + RUN_TIMEOUT_MS - 30_000;
    expect(
      turnLeaseExpiry({
        state: "running",
        turnStartedAt: STARTED_AT,
        now: nearDeadline,
      }),
    ).toBe(STARTED_AT + RUN_TIMEOUT_MS);
    expect(turnExceededAbsoluteLimit(STARTED_AT, nearDeadline)).toBe(false);
    expect(
      turnExceededAbsoluteLimit(STARTED_AT, STARTED_AT + RUN_TIMEOUT_MS),
    ).toBe(true);
  });

  test("skips lease writes while more than half the phase remains", () => {
    const now = STARTED_AT + 10_000;
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "running",
        nextState: "running",
        leaseExpiresAt: now + TURN_RUNNING_LEASE_MS,
        now,
        durationMs: TURN_RUNNING_LEASE_MS,
      }),
    ).toBe(false);
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "running",
        nextState: "running",
        leaseExpiresAt: now + TURN_RUNNING_LEASE_MS / 2,
        now,
        durationMs: TURN_RUNNING_LEASE_MS,
      }),
    ).toBe(true);
  });

  test("always writes when the turn phase advances", () => {
    const now = STARTED_AT + 10_000;
    expect(
      shouldWriteTurnLeaseRenewal({
        currentState: "launching",
        nextState: "running",
        leaseExpiresAt: now + TURN_STARTUP_LEASE_MS,
        now,
        durationMs: TURN_RUNNING_LEASE_MS,
      }),
    ).toBe(true);
  });
});

/**
 * A daemon on a swapping VM froze for ~6 minutes with its process alive; the
 * reconciler finalised its turn the moment the 2-minute lease lapsed and the
 * work was lost. An expired lease on a demonstrably live process now buys
 * grace, bounded so a permanently wedged turn still settles.
 */
describe("expiredTurnLeaseDecision", () => {
  const now = STARTED_AT;

  test("a turn with no sandbox to probe has nothing left running", () => {
    expect(
      expiredTurnLeaseDecision({ liveness: null, silentSince: undefined, now }),
    ).toEqual({ action: "finalize", cause: "process_dead" });
  });

  test("a stopped sandbox VM finalises with its own cause", () => {
    expect(
      expiredTurnLeaseDecision({
        liveness: { alive: false, reason: "sandbox_not_started" },
        silentSince: undefined,
        now,
      }),
    ).toEqual({ action: "finalize", cause: "sandbox_stopped" });
  });

  test("a dead process on a live sandbox finalises immediately", () => {
    expect(
      expiredTurnLeaseDecision({
        liveness: { alive: false, reason: "pid_dead_or_exec_failed" },
        silentSince: undefined,
        now,
      }),
    ).toEqual({ action: "finalize", cause: "process_dead" });
  });

  test("the first silent cycle on a live process is graced", () => {
    expect(
      expiredTurnLeaseDecision({
        liveness: { alive: true, reason: "sandbox_started_pid_alive" },
        silentSince: undefined,
        now,
      }),
    ).toEqual({ action: "grace" });
  });

  test("grace holds right up to the silence budget", () => {
    expect(
      expiredTurnLeaseDecision({
        liveness: { alive: true, reason: "sandbox_started_pid_alive" },
        silentSince: now - TURN_SILENT_ALIVE_GRACE_MS + 1,
        now,
      }),
    ).toEqual({ action: "grace" });
  });

  test("a live process silent for the whole budget is finalised", () => {
    expect(
      expiredTurnLeaseDecision({
        liveness: { alive: true, reason: "sandbox_started_pid_alive" },
        silentSince: now - TURN_SILENT_ALIVE_GRACE_MS,
        now,
      }),
    ).toEqual({ action: "finalize", cause: "silent_timeout" });
  });

  test("an unreachable probe never kills on its own inability to verify", () => {
    expect(
      expiredTurnLeaseDecision({
        liveness: { alive: true, reason: "probe_unreachable_refresh" },
        silentSince: undefined,
        now,
      }),
    ).toEqual({ action: "grace" });
  });
});
