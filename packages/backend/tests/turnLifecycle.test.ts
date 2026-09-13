import { describe, expect, test } from "vitest";
import {
  TURN_FINALIZING_LEASE_MS,
  TURN_RUNNING_LEASE_MS,
  TURN_STARTUP_LEASE_MS,
  canTransitionTurn,
  isStreamingActivityStale,
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

describe("isStreamingActivityStale", () => {
  test("treats a missing heartbeat row as stale", () => {
    expect(isStreamingActivityStale(null, STARTED_AT)).toBe(true);
  });

  test("uses the running-turn lease as the heartbeat window", () => {
    expect(
      isStreamingActivityStale(
        { lastUpdatedAt: STARTED_AT },
        STARTED_AT + TURN_RUNNING_LEASE_MS,
      ),
    ).toBe(false);
    expect(
      isStreamingActivityStale(
        { lastUpdatedAt: STARTED_AT },
        STARTED_AT + TURN_RUNNING_LEASE_MS + 1,
      ),
    ).toBe(true);
  });
});
