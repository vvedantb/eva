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

/** One account the failed turn can be retried on. `null` id = Team. */
export interface UsageLimitRetryCandidate {
  /** Stable key for the in-flight row: an account id, or `TEAM_KEY`. */
  key: string;
  /** Row heading: the account owner's first name, or "Team". */
  name: string;
  /** Plain id; the caller resolves it against the live account docs. */
  accountId: string | null;
  /** The viewer's own account, rather than one a teammate shared. */
  isOwn: boolean;
}

/** In-flight key for the team credential, which has no account id. */
export const TEAM_RETRY_KEY = "team";

interface RetryCandidateInput {
  accounts: ReadonlyArray<{
    id: string;
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
export function usageLimitRetryCandidates({
  accounts,
  provider,
  currentAccountId,
}: RetryCandidateInput): UsageLimitRetryCandidate[] {
  const personal = accounts.flatMap((account) => {
    if (account.provider !== provider) return [];
    if (account.id === currentAccountId) return [];
    return [
      {
        key: account.id,
        name: account.label,
        accountId: account.id,
        isOwn: account.isOwn,
      },
    ];
  });
  if (currentAccountId === null) return personal;
  return [
    ...personal,
    { key: TEAM_RETRY_KEY, name: "Team", accountId: null, isOwn: false },
  ];
}
