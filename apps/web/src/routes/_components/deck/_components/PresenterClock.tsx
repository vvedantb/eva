import { useState } from "react";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function wallClock(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${pad(minutes)}:${pad(seconds % 60)}`;
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
}

interface ClockState {
  start: number;
  now: number;
}

/** Wall clock plus time since the presenter view opened. */
export function PresenterClock() {
  const [clock, setClock] = useState<ClockState>(() => {
    const now = Date.now();
    return { start: now, now };
  });

  // Held in state so the ref callback keeps one identity across renders and the
  // interval is created once rather than torn down and rebuilt every second.
  const [tick] = useState(() => (el: HTMLElement | null) => {
    if (!el) return;
    const id = window.setInterval(
      () => setClock((prev) => ({ ...prev, now: Date.now() })),
      1000,
    );
    return () => window.clearInterval(id);
  });

  return (
    <div
      ref={tick}
      className="flex items-center gap-4 font-mono text-sm tabular-nums text-white/50"
    >
      <span>{wallClock(clock.now)}</span>
      <span aria-label="Time elapsed">{elapsed(clock.now - clock.start)}</span>
    </div>
  );
}
