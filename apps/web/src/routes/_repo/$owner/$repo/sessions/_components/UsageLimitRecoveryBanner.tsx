"use client";

import { useState } from "react";
import {
  api,
  getAIModelProvider,
  parseUsageLimitResetTime,
  type AIModel,
  type Id,
} from "@eva/backend";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ModelAccount } from "@eva/ui";
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
import type { SessionMessage } from "./useSessionSend";

/** A candidate whose id has been checked against the live account docs. */
interface ResolvedCandidate {
  key: string;
  name: string;
  isTeam: boolean;
  isOwn: boolean;
  /** null = the team credential. */
  accountId: Id<"userProviderAccounts"> | null;
}

interface UsageLimitRecoveryBannerProps {
  sessionId: Id<"sessions">;
  repoId: Id<"githubRepos">;
  messages: SessionMessage[];
  model: AIModel;
  accounts: ReadonlyArray<ModelAccount>;
  /** Maps a picker id string back to the branded id from the live docs. */
  resolveAccountId: (
    id: string | null,
  ) => Id<"userProviderAccounts"> | undefined;
  /** undefined while the session query loads; null = Team credential. */
  currentAccountId: Id<"userProviderAccounts"> | null | undefined;
  /** Persists the sticky account and waits for the daemon handoff. */
  onSwitchAccount: (id: Id<"userProviderAccounts"> | null) => Promise<void>;
  isSandboxActive: boolean;
  isExecuting: boolean;
}

/**
 * One-click recovery for a turn that failed on the provider's usage limit.
 * Shown only while that failed reply is the newest message: the retry stages a
 * fresh assistant placeholder, which becomes the newest message and dismisses
 * the card without any extra state.
 *
 * Each account is a row with its own headroom, because the choice between them
 * is exactly the number the rows carry — switching to an account that is also
 * out costs another failed turn.
 */
export function UsageLimitRecoveryBanner({
  sessionId,
  repoId,
  messages,
  model,
  accounts,
  resolveAccountId,
  currentAccountId,
  onSwitchAccount,
  isSandboxActive,
  isExecuting,
}: UsageLimitRecoveryBannerProps) {
  const [inFlightKey, setInFlightKey] = useState<string | null>(null);
  const retryLastTurn = useMutation(
    api.sessionWorkflow.retryLastTurnWithAccount,
  );
  const now = useMinuteNow();
  // Same query and same quantised clock as the composer's usage chip, so the
  // cache serves both and the two surfaces cannot disagree by a tick.
  const entries = useQuery(api.usageLimits.getForViewer, { repoId, now });

  const newest = messages.at(-1);
  if (
    newest === undefined ||
    newest.role !== "assistant" ||
    newest.isSystemAlert === true ||
    newest.errorType !== "rate_limit" ||
    // Until the session lands we do not know which account to exclude, and
    // offering a switch to the account already in use is worse than waiting.
    currentAccountId === undefined
  ) {
    return null;
  }

  const candidates = usageLimitRetryCandidates({
    accounts,
    provider: getAIModelProvider(model),
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
        retryLastTurn({
          sessionId,
          providerAccountId: candidate.accountId,
        }),
      ),
      "Couldn't retry on that account",
      "session-usage-limit-retry",
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
              disabled={!isSandboxActive || isExecuting || inFlightKey !== null}
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
