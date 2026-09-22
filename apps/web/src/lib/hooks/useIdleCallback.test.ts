import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdleCallback } from "./useIdleCallback";

/**
 * `useIdleCallback` is a thin `useRef` wrapper around this; the timing rules
 * that matter — trailing edge, each call cancelling the last, and the newest
 * render's callback winning — all live in the pure core.
 */
describe("createIdleCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once the caller goes quiet, not on the leading edge", () => {
    const fn = vi.fn();
    const idle = createIdleCallback(100, () => fn);
    idle("a");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("cancels the pending call and keeps the last arguments", () => {
    const fn = vi.fn();
    const idle = createIdleCallback(100, () => fn);
    idle("first");
    vi.advanceTimersByTime(90);
    idle("second");
    vi.advanceTimersByTime(90);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledExactlyOnceWith("second");
  });

  it("runs again after a later burst", () => {
    const fn = vi.fn();
    const idle = createIdleCallback(50, () => fn);
    idle(1);
    vi.advanceTimersByTime(50);
    idle(2);
    vi.advanceTimersByTime(50);
    expect(fn.mock.calls).toEqual([[1], [2]]);
  });

  it("calls the newest callback, not the one captured at setup", () => {
    const first = vi.fn();
    const second = vi.fn();
    let current = first;
    const idle = createIdleCallback(10, () => current);
    idle("x");
    current = second;
    vi.advanceTimersByTime(10);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith("x");
  });
});
