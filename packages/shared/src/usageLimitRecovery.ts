import { parseUsageLimitResetTime } from "@eva/backend";
import {
  formatResetDistanceMs,
  formatUtilization,
  maxUtilization,
  reportedWindows,
  resetsInLabel,
  snapshotOf,
  toneForUtilization,
  type UsageAccountEntry,
  type UsageTone,
} from "./usageLimits";

// The usage-limit recovery card of every chat, web and phone: when the newest
// reply failed on the provider's usage limit, offer to retry that turn on
// another account of the same provider, each with its own headroom.

/** The newest message, as far as the card reads it. */
interface RecoveryMessage {
  role: string;
  content: string;
  errorType?: string;
  isSystemAlert?: boolean;
}

/**
 * Whether the card shows: only while the failed reply is the newest message.
 * The retry stages a fresh assistant placeholder, which becomes the newest
 * message and dismisses the card without any extra state.
 */
export function isUsageLimitFailure(newest: RecoveryMessage | undefined): newest is RecoveryMessage {
  return newest !== undefined && newest.role === "assistant" && newest.isSystemAlert !== true && newest.errorType === "rate_limit";
}

/**
 * The reset hint the harness puts in a usage-limit failure, e.g. the
 * `resets 12pm (UTC)` tail of "Error: You've hit your session limit ·
 * resets 12pm (UTC)". Kept as text rather than parsed into a timestamp: the
 * banner only has to repeat what the provider said, and the wording varies
 * ("session limit", "out of extra usage", weekly windows).
 */
export function usageLimitResetText(content: string): string | undefined {
  const match = /resets\s+.+?(?:\(UTC\)|UTC)/i.exec(content);
  if (match === null) return undefined;
  const text = match[0].trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Just the clock half of the reset hint — "resets 12pm (UTC)" → "12pm UTC".
 * The card already says "Resets in 2h 10m", so the provider's own wall-clock
 * time reads as the parenthetical it is rather than a second sentence.
 */
export function usageLimitResetClock(content: string): string | undefined {
  const text = usageLimitResetText(content);
  if (text === undefined) return undefined;
  const clock = text
    .replace(/^resets\s+/i, "")
    .replaceAll(/[()]/g, "")
    .trim();
  return clock.length > 0 ? clock : undefined;
}

/** The card's second line: when the window resets, or that waiting works too. */
export function usageLimitRecoverySubtitle(content: string, now: number): string {
  const resetAt = parseUsageLimitResetTime(content);
  const resetText = usageLimitResetText(content);
  const resetClock = usageLimitResetClock(content);
  if (resetAt !== null && resetAt > now && resetClock !== undefined) {
    return `Resets in ${formatResetDistanceMs(resetAt - now)} (${resetClock})`;
  }
  if (resetText === undefined) return "Waiting for the window to reset will also work.";
  return `${resetText.charAt(0).toUpperCase()}${resetText.slice(1)}`;
}

/** Client-side snapshot matching backend `resolveCredentialSourceLabel`. */
export function resolveCredentialSourceLabel(
  providerAccountId: string | null | undefined,
  accounts: ReadonlyArray<{ id: string; label: string }>,
): string {
  if (!providerAccountId) return "Team";
  const account = accounts.find((entry) => entry.id === providerAccountId);
  const label = account?.label.trim();
  return label && label.length > 0 ? label : "Team";
}

/** "Sam's Claude account is out of usage", or "The team Claude account …". */
export function usageLimitRecoveryTitle(currentLabel: string, providerLabel: string): string {
  const ownerLabel = currentLabel === "Team" ? "The team" : `${currentLabel}'s`;
  return `${ownerLabel} ${providerLabel} account is out of usage`;
}

/** Beside the title while there is an account to retry on. */
export const USAGE_LIMIT_RETRY_HINT = "Retry on another account — same model and reasoning";
/** Under the rows while the sandbox sleeps, which disables them. */
export const USAGE_LIMIT_WAKE_HINT = "Wake the sandbox to retry.";
/** The toast when the switch or the retry fails. */
export const USAGE_LIMIT_RETRY_FAILED = "Couldn't retry on that account";

/** In place of the rows when no other account of the provider is shared. */
export function usageLimitNoAccountCopy(providerLabel: string): string {
  return `No other ${providerLabel} account is shared with you. Ask a teammate to share theirs in Settings → Accounts, or wait for the reset.`;
}

/** One account the failed turn can be retried on. `null` id = Team. */
export interface UsageLimitRetryCandidate<AccountId extends string = string> {
  /** Stable key for the in-flight row: an account id, or `TEAM_KEY`. */
  key: string;
  /** Row heading: the account owner's first name, or "Team". */
  name: string;
  /** null = the team credential. */
  accountId: AccountId | null;
  /** The viewer's own account, rather than one a teammate shared. */
  isOwn: boolean;
}

/** In-flight key for the team credential, which has no account id. */
const TEAM_RETRY_KEY = "team";

interface RetryCandidateInput<AccountId extends string> {
  accounts: ReadonlyArray<{
    id: AccountId;
    provider: string;
    label: string;
    isOwn: boolean;
  }>;
  /** Provider of the chat's model — a Claude limit is no reason to run Codex. */
  provider: string;
  /** null = the team credential is the one that ran out. */
  currentAccountId: string | null;
}

/**
 * The accounts worth offering after a usage-limit failure: same provider,
 * minus the credential that just ran out. Team goes last — a personal account
 * is the more likely fix, and the shared credential is everyone's, so spending
 * it is the fallback rather than the first suggestion.
 */
export function usageLimitRetryCandidates<AccountId extends string>({
  accounts,
  provider,
  currentAccountId,
}: RetryCandidateInput<AccountId>): UsageLimitRetryCandidate<AccountId>[] {
  const personal = accounts.flatMap((account) => {
    if (account.provider !== provider) return [];
    if (account.id === currentAccountId) return [];
    return [{ key: account.id, name: account.label, accountId: account.id, isOwn: account.isOwn }];
  });
  if (currentAccountId === null) return personal;
  return [...personal, { key: TEAM_RETRY_KEY, name: "Team", accountId: null, isOwn: false }];
}

/** Utilisation at which an account is no better than the one that just failed. */
const AT_LIMIT_UTILIZATION = 95;

/** What one retry row says about its account's headroom. */
export interface UsageLimitHeadroom {
  /** Name and the ownership after it: " · yours", " · shared with you", or none for Team. */
  name: string;
  ownership: string | undefined;
  /** The tightest window's use, or undefined when the account never reported. */
  utilization: number | undefined;
  /** "At limit too", "42% used", or "No usage reading yet". */
  usedLabel: string;
  tone: UsageTone;
  /** "resets in 2h", for the tightest window, when it says. */
  resetsLabel: string | undefined;
}

/**
 * One retry row, read before you tap it. The headroom is the whole point:
 * switching to an account that is also at its limit costs another failed
 * turn, and nothing else on screen says which is which.
 */
export function usageLimitHeadroom(
  candidate: Pick<UsageLimitRetryCandidate, "name" | "accountId" | "isOwn">,
  entry: UsageAccountEntry | undefined,
  now: number,
): UsageLimitHeadroom {
  const isTeam = candidate.accountId === null;
  const snapshot = entry === undefined ? undefined : snapshotOf(entry);
  const utilization = snapshot === undefined ? undefined : maxUtilization(snapshot, now);
  const tightest =
    snapshot === undefined || utilization === undefined
      ? undefined
      : reportedWindows(snapshot, now).find((window) => window.utilization === utilization);
  const atLimit = snapshot?.status === "rejected" || (utilization !== undefined && utilization >= AT_LIMIT_UTILIZATION);
  return {
    name: isTeam ? "Team account" : candidate.name,
    ownership: isTeam ? undefined : candidate.isOwn ? " · yours" : " · shared with you",
    utilization,
    usedLabel:
      utilization === undefined ? "No usage reading yet" : atLimit ? "At limit too" : `${formatUtilization(utilization)} used`,
    tone: atLimit ? "danger" : toneForUtilization(utilization ?? 0),
    resetsLabel: tightest?.resetsAt === undefined ? undefined : resetsInLabel(tightest.resetsAt, now),
  };
}
