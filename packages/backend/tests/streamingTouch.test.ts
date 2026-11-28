import { describe, expect, test } from "bun:test";
import {
  STREAMING_TOUCH_COALESCE_MS,
  shouldCoalesceStreamingTouch,
} from "../convex/streaming";

describe("streaming lastUpdatedAt coalescing", () => {
  test("overlapping touches within 2s are skipped", () => {
    const now = 1_800_000_000_000;
    expect(shouldCoalesceStreamingTouch(now, now + 500)).toBe(true);
    expect(
      shouldCoalesceStreamingTouch(now, now + STREAMING_TOUCH_COALESCE_MS),
    ).toBe(false);
  });

  test("a row with no lastUpdatedAt is always written", () => {
    expect(shouldCoalesceStreamingTouch(undefined, 1_800_000_000_000)).toBe(
      false,
    );
    expect(shouldCoalesceStreamingTouch(undefined, 0)).toBe(false);
  });
});
