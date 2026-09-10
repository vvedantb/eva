/**
 * Pure usage-limit text parsing, kept free of every Convex server import so the
 * web app can read the same reset time the workflow schedules its retry for.
 * `recovery.ts` re-exports both, so its importers are unaffected; a dependency
 * added here would put the whole workflow module graph in the browser bundle.
 */

/** Checks whether an error message indicates a Claude API usage limit. */
export function isUsageLimitError(errorMsg: string): boolean {
  const message = errorMsg.toLowerCase();
  return (
    message.includes("out of extra usage") ||
    message.includes("rate limit") ||
    message.includes("usage limit") ||
    message.includes("spend limit") ||
    message.includes("token limit exceeded")
  );
}

/**
 * Parses a usage-limit error message for the reset time.
 * Handles messages like "You're out of extra usage · resets 4pm (UTC)"
 * Returns the reset timestamp (ms since epoch) or null if unparseable.
 */
export function parseUsageLimitResetTime(errorMsg: string): number | null {
  // Match patterns like "resets 4pm (UTC)", "resets 4:30pm (UTC)", "resets 16:00 (UTC)"
  const resetMatch = errorMsg.match(
    /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*\(?\s*UTC\s*\)?/i,
  );
  if (!resetMatch) return null;

  const hourRaw = parseInt(resetMatch[1], 10);
  const minutes = resetMatch[2] ? parseInt(resetMatch[2], 10) : 0;
  const ampm = resetMatch[3]?.toLowerCase();

  let hour24: number;
  if (ampm) {
    // 12-hour format
    if (ampm === "pm" && hourRaw !== 12) {
      hour24 = hourRaw + 12;
    } else if (ampm === "am" && hourRaw === 12) {
      hour24 = 0;
    } else {
      hour24 = hourRaw;
    }
  } else {
    // 24-hour format
    hour24 = hourRaw;
  }

  const now = new Date();
  const resetDate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour24,
      minutes,
      0,
      0,
    ),
  );

  // If the reset time has already passed today, schedule for tomorrow
  if (resetDate.getTime() <= now.getTime()) {
    resetDate.setUTCDate(resetDate.getUTCDate() + 1);
  }

  // Add 2-minute buffer so the limit is definitely cleared
  return resetDate.getTime() + 2 * 60 * 1000;
}
