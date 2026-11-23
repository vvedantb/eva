import { afterEach, describe, expect, test } from "vitest";
import {
  appendClaimedTurnCompletion,
  claimedTurnLifecycleStatus,
  finishClaimedTurn,
  readClaimedTurn,
  routeClaimedTurn,
  startClaimedTurn,
  type ClaimedTurn,
} from "../providers/claimedTurnLifecycle.js";
import {
  canSendTurnHeartbeat,
  getCurrentTurnLease,
  getTurnOwnership,
} from "../runtime/turnLease.js";
import type { JsonObject } from "../types.js";

afterEach(() => {
  finishClaimedTurn();
});

describe("the shared claimed-turn lifecycle", () => {
  test("requires every durable claim to carry its ownership fence", () => {
    expect(() =>
      readClaimedTurn({
        prompt: "Fix it",
        turnLifecycle: "durable",
      }),
    ).toThrow("Durable claimed turn did not include a lease identity");
  });

  test("a prompt without a durable lease is no claim", () => {
    // Every chat turn is durable; the server drops a slot without a turn.
    expect(
      readClaimedTurn({ prompt: "Fix it", turnLifecycle: "legacy" }),
    ).toBeNull();
    expect(readClaimedTurn({ prompt: "Fix it" })).toBeNull();
  });

  test("claimed turns always run as build", () => {
    const lease = {
      turnLifecycle: "durable",
      turnId: "turn-1",
      leaseGeneration: 1,
    };
    expect(
      readClaimedTurn({
        prompt: "Plan the checkout",
        interactionMode: "plan",
        ...lease,
      }),
    ).toMatchObject({ interactionMode: "default" });
    expect(readClaimedTurn({ prompt: "Ship it", ...lease })).toMatchObject({
      interactionMode: "default",
    });
  });

  test("fences the completion from the same state that gates heartbeats", () => {
    // The completion fence and the heartbeat gate used to be separate globals
    // and drifted apart. One ownership state cannot disagree with itself.
    const turn = readClaimedTurn({
      prompt: "Fix it",
      turnLifecycle: "durable",
      turnId: "turn-1",
      leaseGeneration: 2,
    });
    expect(turn).not.toBeNull();
    if (turn === null) return;

    startClaimedTurn(turn);
    expect(claimedTurnLifecycleStatus()).toBe("active");
    expect(getCurrentTurnLease()).toEqual({
      turnId: "turn-1",
      leaseGeneration: 2,
    });
    expect(canSendTurnHeartbeat(getTurnOwnership())).toBe(true);
    const ownership = getTurnOwnership();
    expect(ownership).toEqual({
      status: "owned",
      owner: "claim",
      turnLease: { turnId: "turn-1", leaseGeneration: 2 },
    });
    const completion: JsonObject = { success: false };
    appendClaimedTurnCompletion(completion);
    expect(completion).toEqual({
      success: false,
      turnId: "turn-1",
      leaseGeneration: 2,
    });

    finishClaimedTurn();

    expect(claimedTurnLifecycleStatus()).toBe("idle");
    expect(getCurrentTurnLease()).toBeNull();
    expect(canSendTurnHeartbeat(getTurnOwnership())).toBe(false);
    expect(() => appendClaimedTurnCompletion({ success: false })).toThrow(
      "Cannot complete a claimed turn before it starts",
    );
  });

  test("does not allow overlapping claimed turns", () => {
    const turn = readClaimedTurn({
      prompt: "Fix it",
      turnLifecycle: "durable",
      turnId: "turn-1",
      leaseGeneration: 2,
    });
    expect(turn).not.toBeNull();
    if (turn === null) return;

    startClaimedTurn(turn);

    expect(() => startClaimedTurn(turn)).toThrow(
      "Cannot start a claimed turn while another claim is active",
    );
  });
});

describe("routeClaimedTurn", () => {
  const claim = (turnId: string): ClaimedTurn => ({
    prompt: "Fix it",
    attachmentUrls: [],
    interactionMode: "default",
    turnLease: { turnId, leaseGeneration: 1 },
  });
  let parked: ClaimedTurn[] = [];
  const parkInto = (turn: ClaimedTurn) => (): boolean => {
    parked.push(turn);
    return true;
  };
  afterEach(() => {
    parked = [];
  });

  test("parks a claim when no real turn is active", () => {
    const turn = claim("turn-1");
    expect(
      routeClaimedTurn({
        turn,
        hasActiveRealTurn: false,
        isCancellationInFlight: false,
        park: parkInto(turn),
        logPrefix: "test daemon",
      }),
    ).toBe("parked");
    expect(parked).toEqual([turn]);
  });

  test("reports a duplicate when the park slot is taken", () => {
    expect(
      routeClaimedTurn({
        turn: claim("turn-1"),
        hasActiveRealTurn: false,
        isCancellationInFlight: false,
        park: () => false,
        logPrefix: "test daemon",
      }),
    ).toBe("duplicate");
  });

  test("parks a claim that a cancel hands back while a turn runs", () => {
    // A cancel response can carry the next queued prompt, even the same turn.
    startClaimedTurn(claim("turn-1"));
    const next = claim("turn-1");
    expect(
      routeClaimedTurn({
        turn: next,
        hasActiveRealTurn: true,
        isCancellationInFlight: true,
        park: parkInto(next),
        logPrefix: "test daemon",
      }),
    ).toBe("parked");
    expect(parked).toEqual([next]);
  });

  test("discards a same-turn restage while that turn runs", () => {
    startClaimedTurn(claim("turn-1"));
    const restage = claim("turn-1");
    expect(
      routeClaimedTurn({
        turn: restage,
        hasActiveRealTurn: true,
        isCancellationInFlight: false,
        park: parkInto(restage),
        logPrefix: "test daemon",
      }),
    ).toBe("discarded");
    expect(parked).toEqual([]);
  });

  test("parks a follow-up turn while another turn runs", () => {
    startClaimedTurn(claim("turn-1"));
    const followUp = claim("turn-2");
    expect(
      routeClaimedTurn({
        turn: followUp,
        hasActiveRealTurn: true,
        isCancellationInFlight: false,
        park: parkInto(followUp),
        logPrefix: "test daemon",
      }),
    ).toBe("parked");
    expect(parked).toEqual([followUp]);
  });
});
