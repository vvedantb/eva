import { useSyncExternalStore } from "react";

/**
 * A shared clock per tick length: one interval for every reader of it, running
 * only while one is mounted. `useNow(tickMs)` re-renders its reader each tick
 * with the time quantised to that tick, so readers on one clock agree.
 */
type Clock = { now: number; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null };
const clocks = new Map<number, Clock>();

const quantise = (tickMs: number) => Math.floor(Date.now() / tickMs) * tickMs;

function clockFor(tickMs: number): Clock {
  const existing = clocks.get(tickMs);
  if (existing) return existing;
  const created: Clock = { now: quantise(tickMs), listeners: new Set(), timer: null };
  clocks.set(tickMs, created);
  return created;
}

function subscribe(tickMs: number, listener: () => void) {
  const clock = clockFor(tickMs);
  clock.listeners.add(listener);
  if (!clock.timer) {
    clock.now = quantise(tickMs);
    clock.timer = setInterval(() => {
      clock.now = quantise(tickMs);
      for (const entry of clock.listeners) entry();
    }, tickMs);
  }
  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size === 0 && clock.timer) {
      clearInterval(clock.timer);
      clock.timer = null;
    }
  };
}

function read(tickMs: number): number {
  return clockFor(tickMs).now;
}

export function useNow(tickMs: number): number {
  return useSyncExternalStore(
    (listener) => subscribe(tickMs, listener),
    () => read(tickMs),
  );
}
