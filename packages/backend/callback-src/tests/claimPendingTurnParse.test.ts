import { describe, expect, test } from "bun:test";
import {
  readCancelRequested,
  readStopTaskToolUseIds,
  readTurnLeaseIdentity,
  readUsageRefreshRequested,
} from "../providers/claimPendingTurnParse.js";
import type { JsonValue } from "../types.js";

/**
 * `readCancelRequested` gates interrupt-based cancel (fix 1fc211db): the daemon
 * only calls `query.interrupt()` when this reads `true`. A false negative
 * silently ignores the user's cancel (turn runs on); a false positive tears
 * down a live turn. Both failure modes are invisible without this test, so the
 * envelope unwrapping and the strict `=== true` check are pinned here.
 */
describe("readCancelRequested", () => {
  test("reads a top-level cancel flag", () => {
    expect(readCancelRequested({ cancelRequested: true })).toBe(true);
  });

  /** Convex mutation HTTP responses wrap the payload under `.value`. */
  test("reads a cancel flag nested under the value envelope", () => {
    expect(readCancelRequested({ value: { cancelRequested: true } })).toBe(
      true,
    );
  });

  /**
   * The whole point of the flag: absent means no cancel. Servers that predate
   * the field omit it, and that must never read as a spurious cancel.
   */
  test("a missing flag reads as no cancel", () => {
    expect(readCancelRequested({ stopTaskToolUseIds: [] })).toBe(false);
    expect(readCancelRequested({ value: {} })).toBe(false);
    expect(readCancelRequested({})).toBe(false);
  });

  test("an explicit false reads as no cancel", () => {
    expect(readCancelRequested({ cancelRequested: false })).toBe(false);
    expect(readCancelRequested({ value: { cancelRequested: false } })).toBe(
      false,
    );
  });

  /**
   * The server drains this to `true` exactly once, so only a strict boolean
   * `true` may fire the interrupt. Truthy stand-ins must not.
   */
  test("truthy non-boolean values do not count as a cancel", () => {
    const cases: JsonValue[] = [
      { cancelRequested: "true" },
      { cancelRequested: 1 },
      { value: { cancelRequested: "true" } },
    ];
    for (const input of cases) {
      expect(readCancelRequested(input)).toBe(false);
    }
  });

  test("non-object results read as no cancel", () => {
    const cases: JsonValue[] = [null, true, 5, "cancelRequested", []];
    for (const input of cases) {
      expect(readCancelRequested(input)).toBe(false);
    }
  });
});

describe("readUsageRefreshRequested", () => {
  test("reads a top-level refresh flag", () => {
    expect(readUsageRefreshRequested({ usageRefreshRequested: true })).toBe(
      true,
    );
  });

  test("reads a refresh flag nested under the value envelope", () => {
    expect(
      readUsageRefreshRequested({ value: { usageRefreshRequested: true } }),
    ).toBe(true);
  });

  test("a missing flag reads as no refresh", () => {
    expect(readUsageRefreshRequested({ cancelRequested: true })).toBe(false);
    expect(readUsageRefreshRequested({ value: {} })).toBe(false);
    expect(readUsageRefreshRequested({})).toBe(false);
  });

  test("truthy non-boolean values do not count as a refresh", () => {
    expect(
      readUsageRefreshRequested({ usageRefreshRequested: "true" }),
    ).toBe(false);
  });
});

/**
 * Sibling reader sharing the exact same value-envelope unwrapping. Kept here so
 * a change to that shared shape can only pass if both readers still agree.
 */
describe("readStopTaskToolUseIds", () => {
  test("reads ids from a top-level payload", () => {
    expect(readStopTaskToolUseIds({ stopTaskToolUseIds: ["a", "b"] })).toEqual([
      "a",
      "b",
    ]);
  });

  test("reads ids nested under the value envelope", () => {
    expect(
      readStopTaskToolUseIds({ value: { stopTaskToolUseIds: ["a"] } }),
    ).toEqual(["a"]);
  });

  test("drops non-string entries and defaults missing to empty", () => {
    expect(
      readStopTaskToolUseIds({ stopTaskToolUseIds: ["a", 1, null, "b"] }),
    ).toEqual(["a", "b"]);
    expect(readStopTaskToolUseIds({})).toEqual([]);
    expect(readStopTaskToolUseIds(null)).toEqual([]);
  });
});

describe("readTurnLeaseIdentity", () => {
  test("reads an exact lease identity from Convex's value envelope", () => {
    expect(
      readTurnLeaseIdentity({
        value: { turnId: "turn-1", leaseGeneration: 4 },
      }),
    ).toEqual({ turnId: "turn-1", leaseGeneration: 4 });
  });

  test("rejects partial, non-integral, and non-positive identities", () => {
    expect(readTurnLeaseIdentity({ turnId: "turn-1" })).toBeNull();
    expect(
      readTurnLeaseIdentity({ turnId: "turn-1", leaseGeneration: 1.5 }),
    ).toBeNull();
    expect(
      readTurnLeaseIdentity({ turnId: "turn-1", leaseGeneration: 0 }),
    ).toBeNull();
    expect(
      readTurnLeaseIdentity({ turnId: 1, leaseGeneration: 1 }),
    ).toBeNull();
  });
});
