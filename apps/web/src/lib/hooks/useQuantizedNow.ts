"use client";

import { quantizedSnapshot, subscribeQuantized } from "@eva/ui";
import { useSyncExternalStore } from "react";

/**
 * The current time rounded down to a multiple of `intervalMs`, advancing once
 * per interval.
 *
 * Exists because Convex queries must not read the clock: results are cached and
 * invalidated on data, never on time, so a query that calls `Date.now()` keeps
 * serving the answer it computed the first time it ran. Passing the timestamp in
 * as an argument fixes that — but a raw `Date.now()` in a render body is a
 * different value every render, so the query would resubscribe on each one and
 * never hit the cache.
 *
 * Rounding gives both properties: the argument is identical for the whole
 * interval, and it advances predictably. Pick the interval from how fresh the
 * answer has to be — a minute for a live count, a day for a date window.
 *
 * Every caller of the same interval shares one timeout chain (and the chain
 * sleeps while the tab is hidden). The snapshot is still `floor(now / interval)`,
 * so the value on screen is unchanged.
 */
export function useQuantizedNow(intervalMs: number): number {
  return useSyncExternalStore(
    (onChange) => subscribeQuantized(intervalMs, onChange),
    () => quantizedSnapshot(intervalMs),
    () => quantizedSnapshot(intervalMs),
  );
}
