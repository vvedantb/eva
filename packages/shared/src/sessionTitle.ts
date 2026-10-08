/**
 * A title regeneration older than this is treated as abandoned (the action
 * died before clearing its flag), so the UI re-enables the action and the
 * backend lets a new run start.
 */
export const TITLE_REGENERATION_STALE_MS = 2 * 60 * 1000;

/** True while a session's regeneration flag is set and still fresh at `now`. */
export function isTitleRegenerating(
  titleRegeneration: { startedAt: number } | undefined,
  now: number,
): boolean {
  if (!titleRegeneration) return false;
  return now - titleRegeneration.startedAt < TITLE_REGENERATION_STALE_MS;
}
