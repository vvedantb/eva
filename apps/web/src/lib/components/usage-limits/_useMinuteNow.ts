"use client";

import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function minuteSnapshot(): number {
  return Math.floor(Date.now() / MINUTE_MS);
}

function startTimer(): void {
  if (timer !== undefined) return;
  timer = setInterval(() => {
    for (const notify of listeners) notify();
  }, MINUTE_MS);
}

function stopTimer(): void {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (
    typeof document === "undefined" ||
    document.visibilityState === "visible"
  ) {
    startTimer();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopTimer();
  };
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopTimer();
      return;
    }
    if (listeners.size === 0) return;
    startTimer();
    for (const notify of listeners) notify();
  });
}

/** A shared minute clock for expiry UI, without component-owned timer state. */
export function useMinuteNow(): number {
  const minute = useSyncExternalStore(
    subscribe,
    minuteSnapshot,
    minuteSnapshot,
  );
  return minute * MINUTE_MS;
}
