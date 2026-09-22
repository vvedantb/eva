/** Delay until the soonest toast should leave, or null when the tray is empty. */
export function nextToastExpiryDelay(
  expiresAt: ReadonlyArray<number>,
  now: number,
): number | null {
  if (expiresAt.length === 0) return null;
  return Math.max(0, Math.min(...expiresAt) - now);
}
