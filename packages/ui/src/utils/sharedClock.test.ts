import { afterEach, describe, expect, it, vi } from "vitest";
import {
  msUntilNextBoundary,
  quantizedListenerCount,
  quantizedSnapshot,
  quantizedTimerArmed,
  subscribeQuantized,
} from "./sharedClock";

afterEach(() => {
  vi.useRealTimers();
});

describe("quantizedSnapshot", () => {
  it("floors to the interval so the argument is stable for the whole period", () => {
    expect(quantizedSnapshot(1000, 1_700_000_000_123)).toBe(1_700_000_000_000);
    expect(quantizedSnapshot(1000, 1_700_000_000_999)).toBe(1_700_000_000_000);
  });
});

describe("msUntilNextBoundary", () => {
  it("schedules the remaining slice, not a full interval from now", () => {
    expect(msUntilNextBoundary(1000, 1_700_000_000_250)).toBe(750);
  });

  it("waits a full interval when already on a boundary", () => {
    expect(msUntilNextBoundary(1000, 1_700_000_000_000)).toBe(1000);
  });
});

describe("subscribeQuantized", () => {
  it("one timer serves every subscriber of the same interval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = subscribeQuantized(1000, first);
    const unsubSecond = subscribeQuantized(1000, second);
    expect(quantizedListenerCount(1000)).toBe(2);
    expect(quantizedTimerArmed(1000)).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubFirst();
    expect(quantizedListenerCount(1000)).toBe(1);
    expect(quantizedTimerArmed(1000)).toBe(true);

    unsubSecond();
    expect(quantizedListenerCount(1000)).toBe(0);
    expect(quantizedTimerArmed(1000)).toBe(false);
  });
});
