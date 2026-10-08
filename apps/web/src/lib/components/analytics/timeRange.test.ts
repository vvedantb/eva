import { describe, expect, test } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  TIME_RANGES,
  getBucketSize,
  getPreviousStartTime,
  getStartTime,
  isTimeRange,
} from "./timeRange";

/**
 * These four values are the arguments the analytics queries run on, and both
 * properties that matter here are invisible on screen.
 *
 * Determinism: the functions used to read `dayjs()` themselves, so every render
 * produced a slightly different start time. Convex keys its cache and its
 * subscriptions on the argument object, so the stats page resubscribed and
 * recomputed every one of its five queries on every render — while the queries
 * that read the clock server-side did the opposite and never recomputed at all.
 *
 * Windowing: `previousStartTime` replaced arithmetic the backend used to do with
 * `Date.now()`. If it is not exactly one window earlier, every "vs. previous
 * period" delta on the page is wrong by however far it is off.
 */
const NOW = 1_760_000_000_000;

describe("getStartTime", () => {
  test("returns undefined for all time", () => {
    expect(getStartTime("all", NOW)).toBeUndefined();
  });

  test("counts whole days back from now", () => {
    expect(getStartTime("24h", NOW)).toBe(NOW - 24 * HOUR_MS);
    expect(getStartTime("7d", NOW)).toBe(NOW - 7 * DAY_MS);
    expect(getStartTime("30d", NOW)).toBe(NOW - 30 * DAY_MS);
    expect(getStartTime("90d", NOW)).toBe(NOW - 90 * DAY_MS);
  });

  /** The whole reason `now` is a parameter: same input, same query argument. */
  test("depends only on its arguments", () => {
    for (const range of TIME_RANGES) {
      expect(getStartTime(range, NOW)).toBe(getStartTime(range, NOW));
    }
  });
});

describe("getPreviousStartTime", () => {
  test("returns undefined for all time, which has no previous period", () => {
    expect(getPreviousStartTime("all", NOW)).toBeUndefined();
  });

  /**
   * Equal length and immediately before, for every range — the backend subtracts
   * the current window from this wider one to get the previous period's totals,
   * so a window of the wrong size silently skews every delta.
   */
  test("is the same-length window ending where the current one starts", () => {
    for (const range of TIME_RANGES) {
      const start = getStartTime(range, NOW);
      const previous = getPreviousStartTime(range, NOW);
      if (start === undefined) {
        expect(previous).toBeUndefined();
        continue;
      }
      expect(previous).toBeDefined();
      if (previous === undefined) continue;
      expect(
        start - previous,
        `${range} previous window is not equal-length`,
      ).toBe(NOW - start);
      expect(previous).toBeLessThan(start);
    }
  });
});

describe("getBucketSize", () => {
  /**
   * The timeline builds one bucket per step from the start time, so the bucket
   * has to divide the window into a chart-sized number of points: daily over 30
   * days is 30, daily over 90 would be 90.
   */
  test("is hourly for a day, daily up to 30 days and weekly beyond", () => {
    expect(getBucketSize("24h")).toBe(HOUR_MS);
    expect(getBucketSize("7d")).toBe(DAY_MS);
    expect(getBucketSize("30d")).toBe(DAY_MS);
    expect(getBucketSize("90d")).toBe(7 * DAY_MS);
    expect(getBucketSize("all")).toBe(7 * DAY_MS);
  });
});

describe("isTimeRange", () => {
  /** Guards a URL search param, so it is fed arbitrary strings. */
  test("accepts every range and nothing else", () => {
    for (const range of TIME_RANGES) {
      expect(isTimeRange(range)).toBe(true);
    }
    expect(isTimeRange("1d")).toBe(false);
    expect(isTimeRange("")).toBe(false);
    expect(isTimeRange("ALL")).toBe(false);
  });
});
