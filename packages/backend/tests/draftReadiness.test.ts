import { describe, expect, test } from "vitest";
import {
  missingSignals,
  readinessScore,
  READINESS_LEVELS,
  READINESS_SIGNALS,
} from "../convex/_agentTasks/readiness";

/**
 * The banner is driven entirely by these two functions: the score decides
 * whether it appears at all, the missing list decides what it asks for. Both
 * fail silently if they drift — a wrong score just means the nudge never
 * fires, and a wrong list means it asks for something the draft already says.
 */

describe("readinessScore", () => {
  test("spans 0 to 1 across the levels", () => {
    expect(readinessScore(0)).toBe(0);
    expect(readinessScore(READINESS_LEVELS.length - 1)).toBe(1);
  });

  test("maps 'clear enough to start' to two thirds", () => {
    expect(readinessScore(2)).toBeCloseTo(2 / 3, 10);
  });

  test("clamps positions off either end of the scale", () => {
    expect(readinessScore(-5)).toBe(0);
    expect(readinessScore(READINESS_LEVELS.length + 10)).toBe(1);
  });
});

describe("missingSignals", () => {
  test("returns signals below the threshold in rubric order", () => {
    expect(
      missingSignals({ current: 0.1, expected: 0.2, target: 0.05 }),
    ).toEqual([...READINESS_SIGNALS]);
  });

  test("keeps signals the draft already covers", () => {
    expect(
      missingSignals({ target: 0.9, expected: 0.1, current: 0.8 }),
    ).toEqual(["expected"]);
  });

  test("ignores a signal Jev did not answer", () => {
    expect(
      missingSignals({ target: null, expected: 0.1, current: null }),
    ).toEqual(["expected"]);
  });

  test("treats the threshold itself as present, not missing", () => {
    expect(
      missingSignals({ target: 0.5, expected: 0.499_999, current: 0.6 }),
    ).toEqual(["expected"]);
  });

  test("honours a caller-supplied threshold", () => {
    expect(
      missingSignals({ target: 0.7, expected: 0.9, current: 0.6 }, 0.8),
    ).toEqual(["target", "current"]);
  });
});
