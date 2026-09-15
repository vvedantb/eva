/** How late a periodic tick must be before it is worth a log line. */
export const EVENT_LOOP_STALL_LOG_MS = 30_000;

/** Milliseconds a periodic tick fired later than scheduled, or 0 when within tolerance. */
export function measureTickStallMs(input: {
  previousTickAt: number;
  now: number;
  intervalMs: number;
  toleranceMs: number;
}): number {
  const lateBy = input.now - input.previousTickAt - input.intervalMs;
  return lateBy > input.toleranceMs ? lateBy : 0;
}
