import { describe, expect, test } from "vitest";
import {
  readinessHints,
  READINESS_NUDGE_THRESHOLD,
  shouldNudge,
} from "./readinessHints";

/**
 * The nudge is a judgement call shown over the user's own words, so the two
 * ways it can embarrass itself are covered here: showing at all when the draft
 * is fine, and asking twice for the same thing.
 */

describe("readinessHints", () => {
  test("keeps the order the backend ranked the signals in", () => {
    expect(readinessHints(["target", "expected", "current"])).toEqual([
      "where the change goes",
      "what should happen",
      "what is wrong today",
    ]);
    expect(readinessHints(["current", "target"])).toEqual([
      "what is wrong today",
      "where the change goes",
    ]);
  });

  test("drops repeats", () => {
    expect(readinessHints(["expected", "expected"])).toEqual([
      "what should happen",
    ]);
  });

  test("has nothing to say about an empty list", () => {
    expect(readinessHints([])).toEqual([]);
  });
});

describe("shouldNudge", () => {
  test("stays silent without a result", () => {
    expect(shouldNudge(null)).toBe(false);
  });

  test("fires below the threshold only", () => {
    expect(shouldNudge({ score: 0 })).toBe(true);
    expect(shouldNudge({ score: 0.33 })).toBe(true);
    expect(shouldNudge({ score: READINESS_NUDGE_THRESHOLD })).toBe(false);
    expect(shouldNudge({ score: 2 / 3 })).toBe(false);
    expect(shouldNudge({ score: 1 })).toBe(false);
  });
});
