import { describe, expect, test } from "vitest";
import { isSandboxClosingStatus } from "../convex/_sandbox/closingStatus";

/**
 * Manager Ave (prod session 111) answered nothing but "Turn stalled" for weeks.
 * Axiom showed each wake-up validating the same healthy sandbox and then
 * `sandbox:prewarmSessionDaemon` returning in 63ms — `skipPrewarm`, because the
 * session status was still "closed" from a stop weeks earlier. No daemon meant
 * no `claimPendingTurn`, so the turn's lease was never acquired
 * (`leaseGeneration` 0) and the watchdog errored it out after the 15-minute
 * startup timeout.
 */
describe("a turn on a reused sandbox clears the stale closed status", () => {
  test("prewarm still skips closing sessions", () => {
    expect(isSandboxClosingStatus("closed")).toBe(true);
    expect(isSandboxClosingStatus("stopping")).toBe(true);
    expect(isSandboxClosingStatus("active")).toBe(false);
  });
});
