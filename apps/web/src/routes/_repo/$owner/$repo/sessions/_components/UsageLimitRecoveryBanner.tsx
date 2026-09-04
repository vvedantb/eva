"use client";

import { useState } from "react";
import { api, getAIModelProvider, type AIModel, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { Badge, Button, type ModelAccount } from "@eva/ui";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { resolveCredentialSourceLabel } from "@/lib/utils/credentialSourceLabel";
import { usageLimitResetText } from "./usageLimitBanner";
import type { SessionMessage } from "./useSessionSend";

/** In-flight key for the team credential, which has no account id. */
const TEAM_KEY = "team";

interface RetryCandidate {
  /** Stable key for the in-flight button: an account id, or `TEAM_KEY`. */
  key: string;
  /** Possessive noun for the button copy: "Vedant's account" / "the team account". */
  label: string;
  /** null = the team credential. */
  accountId: Id<"userProviderAccounts"> | null;
}

interface UsageLimitRecoveryBannerProps {
  sessionId: Id<"sessions">;
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
 * the banner without any extra state.
 */
export function UsageLimitRecoveryBanner({
  sessionId,
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

  const provider = getAIModelProvider(model);
  const accountCandidates: RetryCandidate[] = accounts.flatMap((account) => {
    if (account.provider !== provider) return [];
    if (account.id === currentAccountId) return [];
    const accountId = resolveAccountId(account.id);
    // A deleted account is still in a stale picker snapshot; retrying on it
    // would fail server-side, so leave it out rather than offer a dead button.
    if (accountId === undefined) return [];
    return [
      { key: account.id, label: `${account.label}'s account`, accountId },
    ];
  });
  // Team last: a personal account is the more likely fix, and the team
  // credential is shared, so spending it is the fallback.
  const candidates: RetryCandidate[] =
    currentAccountId === null
      ? accountCandidates
      : [
          ...accountCandidates,
          { key: TEAM_KEY, label: "the team account", accountId: null },
        ];

  const currentLabel = resolveCredentialSourceLabel(currentAccountId, accounts);
  const reset = usageLimitResetText(newest.content);
  const owner = currentLabel === "Team" ? "The team" : `${currentLabel}'s`;
  const suffix =
    candidates.length === 0
      ? " No other shared account is available."
      : isSandboxActive
        ? ""
        : " Wake the sandbox to retry.";
  const description = `${owner} Claude account hit its usage limit${
    reset === undefined ? "" : ` · ${reset}`
  }.${suffix}`;

  const handleRetry = (candidate: RetryCandidate) => {
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
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-surface border border-border bg-muted/30 px-3 py-2.5">
      <Badge
        variant="destructive"
        className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-semibold tracking-wide uppercase"
      >
        Limit reached
      </Badge>
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">
        {description}
      </span>
      {candidates.map((candidate) => (
        <Button
          key={candidate.key}
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          disabled={!isSandboxActive || isExecuting || inFlightKey !== null}
          onClick={() => handleRetry(candidate)}
        >
          {inFlightKey === candidate.key
            ? `Switching to ${candidate.label}...`
            : `Switch to ${candidate.label} and retry`}
        </Button>
      ))}
    </div>
  );
}
