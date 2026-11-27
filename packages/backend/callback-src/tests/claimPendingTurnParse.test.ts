import { describe, expect, test } from "bun:test";
import {
  readCancelRequested,
  readStopTaskToolUseIds,
  readTurnLeaseIdentity,
  readUsageRefreshRequested,
} from "../providers/claimPendingTurnParse.js";
import type { JsonValue } from "../types.js";

describe("readCancelRequested", () => {
  test("reads a top-level cancel flag", () => {
    expect(readCancelRequested({ cancelRequested: true })).toBe(true);
  });

  test("reads a cancel flag nested under the value envelope", () => {
    expect(readCancelRequested({ value: { cancelRequested: true } })).toBe(
      true,
    );
  });

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
