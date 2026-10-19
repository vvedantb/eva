/**
 * Pure rules for chat wake-ups (`schedule_wakeup`): the limits and the message
 * a fired wake sends. The Convex side lives in `wakeups.ts`.
 */

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** At most this many wakes wait at once on one chat. */
export const WAKEUP_PENDING_LIMIT = 3;
/** At most this many wakes over a chat's lifetime, so a re-arm loop ends. */
export const WAKEUP_LIFETIME_LIMIT = 20;
/** No wake fires more than this far ahead (from now, or from the merge). */
export const WAKEUP_MAX_DELAY_MS = 30 * DAY_MS;
/** The prompt is a reminder to the agent, not a document. */
export const WAKEUP_PROMPT_MAX_CHARS = 4_000;

/** Why a new wake is refused, or null when it may be scheduled. */
export function wakeupLimitError(args: {
  pending: number;
  total: number;
  delayMs: number;
  promptChars: number;
}): string | null {
  if (args.promptChars === 0) return "The prompt is empty.";
  if (args.promptChars > WAKEUP_PROMPT_MAX_CHARS) {
    return `The prompt is longer than ${WAKEUP_PROMPT_MAX_CHARS} characters. Keep it to what the next check must do.`;
  }
  if (args.delayMs < 0 || args.delayMs > WAKEUP_MAX_DELAY_MS) {
    return "A wake-up must fire within 30 days.";
  }
  if (args.pending >= WAKEUP_PENDING_LIMIT) {
    return `This chat already has ${WAKEUP_PENDING_LIMIT} pending wake-ups. Cancel one with cancel_wakeup first.`;
  }
  if (args.total >= WAKEUP_LIFETIME_LIMIT) {
    return `This chat has used all ${WAKEUP_LIFETIME_LIMIT} of its wake-ups. Ask the user to follow up by hand.`;
  }
  return null;
}

/** "3h", "2d 4h" or "45m": how long ago something happened. */
export function formatSpan(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

/** The message a fired wake sends into the chat that set it. */
export function buildWakeupMessage(args: {
  prompt: string;
  createdAt: number;
  now: number;
  merged?: { prUrl: string; prNumber: number; delayMs: number };
}): string {
  const setAgo = formatSpan(args.now - args.createdAt);
  const why =
    args.merged === undefined
      ? `the time you picked has come`
      : `PR #${args.merged.prNumber} (${args.merged.prUrl}) merged, and this is the check you asked for ${formatSpan(args.merged.delayMs)} after the merge`;
  return [
    `Scheduled wake-up you set ${setAgo} ago: ${why}.`,
    "",
    args.prompt,
    "",
    "This chat may run in a fresh sandbox on the latest base branch, not your old working tree. If the work is not ready yet (for example a flag is still rolling out), call schedule_wakeup again to check later. When you are done, end your turn.",
  ].join("\n");
}
