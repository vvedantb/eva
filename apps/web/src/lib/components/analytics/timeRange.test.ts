import { describe, expect, test } from "bun:test";
import {
  DAY_MS,
  HOUR_MS,
  TIME_RANGES,
  getBucketSize,
  getPreviousStartTime,
  getStartTime,
  isTimeRange,
} from "./timeRange";

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
  test("is hourly for a day, daily up to 30 days and weekly beyond", () => {
    expect(getBucketSize("24h")).toBe(HOUR_MS);
    expect(getBucketSize("7d")).toBe(DAY_MS);
    expect(getBucketSize("30d")).toBe(DAY_MS);
    expect(getBucketSize("90d")).toBe(7 * DAY_MS);
    expect(getBucketSize("all")).toBe(7 * DAY_MS);
  });
});

describe("isTimeRange", () => {
  test("accepts every range and nothing else", () => {
    for (const range of TIME_RANGES) {
      expect(isTimeRange(range)).toBe(true);
    }
    expect(isTimeRange("1d")).toBe(false);
    expect(isTimeRange("")).toBe(false);
    expect(isTimeRange("ALL")).toBe(false);
  });
});
