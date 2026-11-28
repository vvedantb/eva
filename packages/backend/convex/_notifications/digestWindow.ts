const DIGEST_HOUR_UTC = 8;
/** The daily digest runs at 08:00 UTC, Monday to Friday (crons.ts). */
export const DIGEST_CRON = `0 ${DIGEST_HOUR_UTC} * * 1-5`;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKEND_DAYS: ReadonlySet<number> = new Set([6, 0]);

/**
 * Start of the digest window for a run at `now`: the previous weekday run, at
 * 08:00 UTC. Monday's run reaches back to Friday's, so weekend items are
 * included. A digest stamps `emailedAt` on what it sends, so an overlap never
 * sends a row twice.
 */
export function digestWindowStart(now: number): number {
  let start = Math.floor(now / DAY_MS) * DAY_MS + DIGEST_HOUR_UTC * HOUR_MS;
  if (start > now) start -= DAY_MS;
  do {
    start -= DAY_MS;
  } while (WEEKEND_DAYS.has(new Date(start).getUTCDay()));
  return start;
}
