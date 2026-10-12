/**
 * Pure usage-limit text parsing, kept free of every Convex server import so the
 * web app can read the same reset time the workflow schedules its retry for.
 * `recovery.ts` re-exports both, so its importers are unaffected; a dependency
 * added here would put the whole workflow module graph in the browser bundle.
 * (`aiModels` is already browser-safe: the web app imports it directly.)
 */
import { getAIModelProvider, normalizeAIModel } from "../_validators/aiModels";

/**
 * Checks whether an error message indicates a Claude API usage limit.
 * Covers the wordings Claude ships today: "You're out of extra usage",
 * "You've hit your session limit", "You've hit your individual spend limit",
 * plus generic rate-limit, usage-limit and token-limit copy.
 */
export function isUsageLimitError(errorMsg: string): boolean {
  const message = errorMsg.toLowerCase();
  return (
    message.includes("out of extra usage") ||
    message.includes("rate limit") ||
    message.includes("usage limit") ||
    message.includes("session limit") ||
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

/**
 * Extra wait on top of `parseUsageLimitResetTime`'s 2-minute margin before a
 * held chat queue sends: ~10 minutes after the provider's stated reset, so a
 * window that clears a little late does not fail the queued turn too.
 */
export const USAGE_LIMIT_QUEUE_RESUME_DELAY_MS = 8 * 60 * 1000;

/** Same label `resolveCredentialSourceLabel` stamps for the shared credential. */
const TEAM_CREDENTIAL_LABEL = "Team";

/** A chat queue waiting out a usage limit. */
export interface UsageLimitHold {
  /** When the held queue sends (ms since epoch). */
  resumeAt: number;
  /** Model stamp of the turn that ran out; undefined on a legacy turn. */
  model: string | undefined;
  /**
   * The credential that ran out: an account id, null for Team, or undefined
   * when the turn predates the `credentialAccountId` stamp (holds every
   * account, as before).
   */
  accountId: string | null | undefined;
}

/**
 * Whether a chat's queue is waiting out a usage limit: the newest real turn
 * failed on one and its reset (plus the resume delay) is still ahead. Returns
 * the failed turn's model and account so callers only hold messages on that
 * credential — see `isHeldByUsageLimit`.
 */
export function findUsageLimitHold(
  messagesNewestFirst: ReadonlyArray<{
    role: string;
    isSystemAlert?: boolean;
    errorType?: string;
    limitResetAt?: number;
    model?: string;
    credentialSourceLabel?: string;
    credentialAccountId?: string;
  }>,
  now: number,
): UsageLimitHold | null {
  let resumeAt: number | undefined;
  for (const message of messagesNewestFirst) {
    if (message.isSystemAlert === true) continue;
    if (resumeAt === undefined) {
      if (
        message.role !== "assistant" ||
        message.errorType !== "rate_limit" ||
        message.limitResetAt === undefined
      ) {
        return null;
      }
      resumeAt = message.limitResetAt + USAGE_LIMIT_QUEUE_RESUME_DELAY_MS;
      if (resumeAt <= now) return null;
      continue;
    }
    if (message.role === "user") {
      return {
        resumeAt,
        model: message.model,
        accountId:
          message.credentialAccountId ??
          (message.credentialSourceLabel === TEAM_CREDENTIAL_LABEL
            ? null
            : undefined),
      };
    }
    break;
  }
  return resumeAt === undefined
    ? null
    : { resumeAt, model: undefined, accountId: undefined };
}

/**
 * Whether `hold` blocks a turn on `model` and `accountId` (null = Team). Only
 * the credential that ran out waits: another provider, or another account on
 * the same provider, sends now. An unstamped field on the failed turn matches
 * everything, so a legacy turn keeps holding the way it always did.
 */
export function isHeldByUsageLimit(
  hold: UsageLimitHold | null,
  model: string,
  accountId: string | null,
): boolean {
  if (hold === null) return false;
  if (
    hold.model !== undefined &&
    getAIModelProvider(normalizeAIModel(hold.model)) !==
      getAIModelProvider(normalizeAIModel(model))
  ) {
    return false;
  }
  return hold.accountId === undefined || hold.accountId === accountId;
}
