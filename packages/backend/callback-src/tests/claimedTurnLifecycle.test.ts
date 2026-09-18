import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  appendClaimedTurnCompletion,
  claimedTurnLifecycleStatus,
  finishClaimedTurn,
  readClaimedTurn,
  shouldParkClaimedTurn,
  startClaimedTurn,
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

  test("rejects a lease on a claim explicitly marked legacy", () => {
    expect(() =>
      readClaimedTurn({
        prompt: "Fix it",
        turnLifecycle: "legacy",
        turnId: "turn-1",
        leaseGeneration: 2,
      }),
    ).toThrow("Legacy claimed turn unexpectedly included a lease identity");
  });

  test("preserves durable ownership across heartbeat and completion", () => {
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
    expect(
      canSendTurnHeartbeat({
        claimMutation: "sessions:claimPendingTurn",
        ownership: getTurnOwnership(),
      }),
    ).toBe(true);
    const completion: JsonObject = { success: true };
    appendClaimedTurnCompletion(completion);
    expect(completion).toEqual({
      success: true,
      turnId: "turn-1",
      leaseGeneration: 2,
    });

    finishClaimedTurn();

    expect(claimedTurnLifecycleStatus()).toBe("idle");
    expect(getCurrentTurnLease()).toBeNull();
    expect(
      canSendTurnHeartbeat({
        claimMutation: "sessions:claimPendingTurn",
        ownership: getTurnOwnership(),
      }),
    ).toBe(false);
  });

  test("claimed turns always run as build", () => {
    expect(
      readClaimedTurn({
        prompt: "Plan the checkout",
        interactionMode: "plan",
      }),
    ).toMatchObject({ interactionMode: "default" });
    expect(readClaimedTurn({ prompt: "Ship it" })).toMatchObject({
      interactionMode: "default",
    });
  });

  test("keeps explicitly legacy claims unfenced", () => {
    const turn = readClaimedTurn({
      prompt: "Legacy task chat",
      turnLifecycle: "legacy",
    });
    expect(turn).not.toBeNull();
    if (turn === null) return;

    startClaimedTurn(turn);
    const completion: JsonObject = { success: true };
    appendClaimedTurnCompletion(completion);

    expect(getCurrentTurnLease()).toBeNull();
    expect(
      canSendTurnHeartbeat({
        claimMutation: "projectChatWorkflow:claimPendingTurn",
        ownership: getTurnOwnership(),
      }),
    ).toBe(true);
    expect(completion).toEqual({ success: true });

    finishClaimedTurn();
    expect(
      canSendTurnHeartbeat({
        claimMutation: "projectChatWorkflow:claimPendingTurn",
        ownership: getTurnOwnership(),
      }),
    ).toBe(false);
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

    expect(
      canSendTurnHeartbeat({
        claimMutation: "sessions:claimPendingTurn",
        ownership: getTurnOwnership(),
      }),
    ).toBe(false);
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

  test("does not allow completion before a claim starts", () => {
    finishClaimedTurn();
    expect(() => appendClaimedTurnCompletion({ success: false })).toThrow(
      "Cannot complete a claimed turn before it starts",
    );
  });
});

describe("canSendTurnHeartbeat follows claim ownership", () => {
  const CLAIM = "sessionWorkflow:claimPendingTurn";

  function claim(payload: JsonObject): void {
    const turn = readClaimedTurn(payload);
    expect(turn).not.toBeNull();
    if (turn === null) return;
    startClaimedTurn(turn);
  }

  function allowed(claimMutation: string | undefined): boolean {
    return canSendTurnHeartbeat({
      claimMutation,
      ownership: getTurnOwnership(),
    });
  }

  test("a one-shot job with no claim mutation always heartbeats", () => {
    expect(allowed(undefined)).toBe(true);
  });

  test("an idle daemon that has claimed nothing stays silent", () => {
    expect(allowed(CLAIM)).toBe(false);
  });

  test("a legacy claim heartbeats even though it carries no lease", () => {
    claim({ prompt: "Legacy task chat", turnLifecycle: "legacy" });
    expect(getCurrentTurnLease()).toBeNull();
    expect(allowed(CLAIM)).toBe(true);
  });

  test("a durable claim heartbeats while it holds the lease", () => {
    claim({
      prompt: "Fix it",
      turnLifecycle: "durable",
      turnId: "turn-1",
      leaseGeneration: 2,
    });
    expect(getCurrentTurnLease()).toEqual({
      turnId: "turn-1",
      leaseGeneration: 2,
    });
    expect(allowed(CLAIM)).toBe(true);
  });

  test("a durable claim goes silent again once the lease is released", () => {
    claim({
      prompt: "Fix it",
      turnLifecycle: "durable",
      turnId: "turn-1",
      leaseGeneration: 2,
    });
    finishClaimedTurn();
    expect(getCurrentTurnLease()).toBeNull();
    expect(allowed(CLAIM)).toBe(false);
  });
});

describe("shouldParkClaimedTurn", () => {
  test("parks idle, cancel, and finalizing claims", () => {
    expect(
      shouldParkClaimedTurn({
        hasActiveRealTurn: false,
        isCancellationInFlight: false,
        isFinalizing: false,
        currentLeaseTurnId: null,
        claimedLeaseTurnId: "turn-2",
      }),
    ).toBe(true);
    expect(
      shouldParkClaimedTurn({
        hasActiveRealTurn: true,
        isCancellationInFlight: true,
        isFinalizing: false,
        currentLeaseTurnId: "turn-1",
        claimedLeaseTurnId: "turn-2",
      }),
    ).toBe(true);
    expect(
      shouldParkClaimedTurn({
        hasActiveRealTurn: true,
        isCancellationInFlight: false,
        isFinalizing: true,
        currentLeaseTurnId: null,
        claimedLeaseTurnId: "turn-2",
      }),
    ).toBe(true);
  });

  test("discards a same-turn restage and parks a follow-up turn", () => {
    expect(
      shouldParkClaimedTurn({
        hasActiveRealTurn: true,
        isCancellationInFlight: false,
        isFinalizing: false,
        currentLeaseTurnId: "turn-1",
        claimedLeaseTurnId: "turn-1",
      }),
    ).toBe(false);
    expect(
      shouldParkClaimedTurn({
        hasActiveRealTurn: true,
        isCancellationInFlight: false,
        isFinalizing: false,
        currentLeaseTurnId: "turn-1",
        claimedLeaseTurnId: "turn-2",
      }),
    ).toBe(true);
  });
});

describe("persistent providers obey the same lifecycle contract", () => {
  const providerPaths = [
    "providers/claudeSdkDaemon.ts",
    "providers/cursorSdkDaemon.ts",
    "providers/codexAppServerDaemon.ts",
  ];

  for (const providerPath of providerPaths) {
    test(providerPath, () => {
      const source = readSource(providerPath);
      expect(source).toContain("readClaimedTurn");
      expect(source).toContain("startClaimedTurn(turn)");
      expect(source).toContain("appendClaimedTurnCompletion(completionArgs)");
      expect(source).toContain("finishClaimedTurn()");
      expect(source).not.toContain("function readClaimedTurn(");
      expect(source).not.toContain('beginTurnOwnership("claim"');
    });
  }
});

function readSource(relativePath: string): string {
  return readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", relativePath),
    "utf8",
  ).replaceAll("\r\n", "\n");
}
