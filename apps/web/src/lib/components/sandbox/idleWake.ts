/** A second automatic wake of the same entity within this window is refused, so a start that keeps failing cannot loop. */
export const AUTO_WAKE_COOLDOWN_MS = 60_000;

const lastAutoWakeAt = new Map<string, number>();

/** True (and records the attempt) when no auto-wake for `key` happened inside the cooldown. */
export function shouldFireAutoWake(key: string, now: number): boolean {
  const last = lastAutoWakeAt.get(key);
  if (last !== undefined && now - last < AUTO_WAKE_COOLDOWN_MS) return false;
  lastAutoWakeAt.set(key, now);
  return true;
}

/** Test-only reset. */
export function resetAutoWakeHistory(): void {
  lastAutoWakeAt.clear();
}
