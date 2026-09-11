"use client";

import { useState } from "react";
import {
  api,
  getAIModelProvider,
  parseUsageLimitResetTime,
  type Id,
} from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { IconAlertTriangle } from "@tabler/icons-react";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { resolveCredentialSourceLabel } from "@/lib/utils/credentialSourceLabel";
import { formatResetDistanceMs } from "@/lib/components/usage-limits/_utils";
import { useMinuteNow } from "@/lib/components/usage-limits/_useMinuteNow";
import {
  usageLimitResetClock,
  usageLimitResetText,
  usageLimitRetryCandidates,
} from "./usageLimitBanner";
import { UsageLimitAccountOption } from "./UsageLimitAccountOption";
import type { SandboxChatSurface } from "./sandboxChatSurface";
import { useRetryLastTurnWithAccount } from "./useRetryLastTurnWithAccount";

/** A candidate whose id has been checked against the live account docs. */
interface ResolvedCandidate {
  key: string;
  name: string;
  isTeam: boolean;
  isOwn: boolean;
  /** null = the team credential. */
  accountId: Id<"userProviderAccounts"> | null;
}

/**
 * One-click recovery for a turn that failed on the provider's usage limit, in
 * any sandbox chat. Shown only while that failed reply is the newest message:
 * the retry stages a fresh assistant placeholder, which becomes the newest
 * message and dismisses the card without any extra state.
 *
 * Each account is a row with its own headroom, because the choice between them
 * is exactly the number the rows carry — switching to an account that is also
 * out costs another failed turn.
 */
export function UsageLimitRecoveryBanner({
  surface,
}: {
  surface: SandboxChatSurface;
}) {
  const recovery = surface.usageLimitRecovery;
  const [inFlightKey, setInFlightKey] = useState<string | null>(null);
  const retryLastTurn = useRetryLastTurnWithAccount(surface.entity);
  const now = useMinuteNow();
  const newest = recovery?.messages.at(-1);
  // Its own const so the narrowing below survives: `undefined` here is either
  // "no recovery" or "entity still loading", and `showsCard` rules out both.
  const currentAccountId = recovery?.currentAccountId;
  // Whether the card renders at all, decided before the query so a chat that
  // never hit a limit does not subscribe to usage readings it will not show.
  const showsCard =
    recovery !== undefined &&
    newest !== undefined &&
    newest.role === "assistant" &&
    newest.isSystemAlert !== true &&
    newest.errorType === "rate_limit" &&
    // Until the entity lands we do not know which account to exclude, and
    // offering a switch to the account already in use is worse than waiting.
    currentAccountId !== undefined;
  // Same query and same quantised clock as the composer's usage chip, so the
  // cache serves both and the two surfaces cannot disagree by a tick.
  const entries = useQuery(
    api.usageLimits.getForViewer,
    showsCard ? { repoId: surface.repoId, now } : "skip",
  );

  if (!showsCard) return null;

  const { accounts, resolveAccountId, onSwitchAccount, isSandboxActive } =
    recovery;
  const candidates = usageLimitRetryCandidates({
    accounts,
    provider: getAIModelProvider(surface.model),
    currentAccountId,
  }).flatMap<ResolvedCandidate>((candidate) => {
    if (candidate.accountId === null) {
      return [{ ...candidate, isTeam: true, accountId: null }];
    }
    const accountId = resolveAccountId(candidate.accountId);
    // A deleted account is still in a stale picker snapshot; retrying on it
    // would fail server-side, so leave it out rather than offer a dead row.
    if (accountId === undefined) return [];
    return [{ ...candidate, isTeam: false, accountId }];
  });

  const currentLabel = resolveCredentialSourceLabel(currentAccountId, accounts);
  const ownerLabel = currentLabel === "Team" ? "The team" : `${currentLabel}'s`;
  const resetAt = parseUsageLimitResetTime(newest.content);
  const resetText = usageLimitResetText(newest.content);
  const resetClock = usageLimitResetClock(newest.content);
  const subtitle =
    resetAt !== null && resetAt > now && resetClock !== undefined
      ? `Resets in ${formatResetDistanceMs(resetAt - now)} (${resetClock})`
      : resetText === undefined
        ? "Waiting for the window to reset will also work."
        : `${resetText.charAt(0).toUpperCase()}${resetText.slice(1)}`;

  const entryFor = (accountId: Id<"userProviderAccounts"> | null) =>
    entries?.find(
      (entry) => entry.providerAccountId === (accountId ?? undefined),
    );

  const handleRetry = (candidate: ResolvedCandidate) => {
    setInFlightKey(candidate.key);
    // The switch has to complete before the retry stages the turn, or the
    // replacement daemon would still be running the exhausted credential.
    // Cleanup is duplicated across `then`/`catch` rather than written once in a
    // `finally`: React Compiler cannot compile a `finally`.
    void catchMutationError(
      onSwitchAccount(candidate.accountId).then(() =>
        retryLastTurn(candidate.accountId),
      ),
      "Couldn't retry on that account",
      "chat-usage-limit-retry",
    )
      .then(() => setInFlightKey(null))
      .catch(() => setInFlightKey(null));
  };

  return (
    <div className="mb-2 flex flex-col gap-3 rounded-surface bg-muted p-3">
      <div className="flex items-start gap-2.5">
        <IconAlertTriangle
          size={18}
          className="mt-0.5 shrink-0 text-destructive"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {ownerLabel} Claude account is out of usage
          </p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {candidates.length > 0 ? (
          <span className="hidden max-w-56 shrink-0 text-right text-xs text-muted-foreground sm:block">
            Retry on another account — same model and reasoning
          </span>
        ) : null}
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No other Claude account is shared with you. Ask a teammate to share
          theirs in Settings → Accounts, or wait for the reset.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {candidates.map((candidate) => (
            <UsageLimitAccountOption
              key={candidate.key}
              name={candidate.name}
              isTeam={candidate.isTeam}
              isOwn={candidate.isOwn}
              entry={entryFor(candidate.accountId)}
              now={now}
              disabled={
                !isSandboxActive || surface.isExecuting || inFlightKey !== null
              }
              inFlight={inFlightKey === candidate.key}
              onSelect={() => handleRetry(candidate)}
            />
          ))}
          {isSandboxActive ? null : (
            <p className="px-3 pt-0.5 text-xs text-muted-foreground">
              Wake the sandbox to retry.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
