"use client";

import { useState } from "react";
import { api, getAIModelProvider, type Id } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { getProviderLabel, tokenTransition } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { catchMutationError } from "@/lib/utils/mutationToast";
import {
  isUsageLimitFailure,
  resolveCredentialSourceLabel,
  USAGE_LIMIT_RETRY_FAILED,
  USAGE_LIMIT_RETRY_HINT,
  USAGE_LIMIT_WAKE_HINT,
  usageLimitNoAccountCopy,
  usageLimitRecoverySubtitle,
  usageLimitHeadroom,
  usageLimitRecoveryTitle,
  usageLimitRetryCandidates,
} from "@eva/shared/usageLimitRecovery";
import { useQuantizedNow } from "@/lib/hooks/useQuantizedNow";
import { UsageLimitAccountOption } from "./UsageLimitAccountOption";
import type { SandboxChatSurface } from "./sandboxChatSurface";
import { useRetryLastTurnWithAccount } from "./useRetryLastTurnWithAccount";

interface ResolvedCandidate {
  key: string;
  name: string;
  isTeam: boolean;
  isOwn: boolean;
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
  const now = useQuantizedNow(60_000);
  const newest = recovery?.messages.at(-1);
  const currentAccountId = recovery?.currentAccountId;
  const showsCard =
    recovery !== undefined &&
    isUsageLimitFailure(newest) &&
    currentAccountId !== undefined;
  const entries = useQuery(
    api.usageLimits.getForViewer,
    showsCard ? { repoId: surface.repoId, now } : "skip",
  );

  let card = null;
  if (showsCard) {
    const { accounts, resolveAccountId, onSwitchAccount, isSandboxActive } =
      recovery;
    const provider = getAIModelProvider(surface.model);
    const providerLabel = getProviderLabel(provider);
    const candidates = usageLimitRetryCandidates({
      accounts,
      provider,
      currentAccountId,
    }).flatMap<ResolvedCandidate>((candidate) => {
      if (candidate.accountId === null) {
        return [{ ...candidate, isTeam: true, accountId: null }];
      }
      const accountId = resolveAccountId(candidate.accountId);
      if (accountId === undefined) return [];
      return [{ ...candidate, isTeam: false, accountId }];
    });

    const currentLabel = resolveCredentialSourceLabel(
      currentAccountId,
      accounts,
    );
    const title = usageLimitRecoveryTitle(currentLabel, providerLabel);
    const subtitle = usageLimitRecoverySubtitle(newest.content, now);

    const entryFor = (accountId: Id<"userProviderAccounts"> | null) =>
      entries?.find(
        (entry) => entry.providerAccountId === (accountId ?? undefined),
      );

    const handleRetry = (candidate: ResolvedCandidate) => {
      setInFlightKey(candidate.key);
      void catchMutationError(
        onSwitchAccount(candidate.accountId).then(() =>
          retryLastTurn(candidate.accountId),
        ),
        USAGE_LIMIT_RETRY_FAILED,
        "chat-usage-limit-retry",
      )
        .then(() => setInFlightKey(null))
        .catch(() => setInFlightKey(null));
    };

    card = (
      <m.div
        key={newest._id}
        className="mb-2 flex flex-col gap-3 rounded-surface bg-muted p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={tokenTransition.fast}
      >
        <div className="flex items-start gap-2.5">
          <IconAlertTriangle
            size={18}
            className="mt-0.5 shrink-0 text-destructive"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {title}
            </p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {candidates.length > 0 ? (
            <span className="hidden max-w-56 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {USAGE_LIMIT_RETRY_HINT}
            </span>
          ) : null}
        </div>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {usageLimitNoAccountCopy(providerLabel)}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {candidates.map((candidate) => (
              <UsageLimitAccountOption
                key={candidate.key}
                headroom={usageLimitHeadroom(
                  candidate,
                  entryFor(candidate.accountId),
                  now,
                )}
                isTeam={candidate.isTeam}
                disabled={
                  !isSandboxActive ||
                  surface.isExecuting ||
                  inFlightKey !== null
                }
                inFlight={inFlightKey === candidate.key}
                onSelect={() => handleRetry(candidate)}
              />
            ))}
            {isSandboxActive ? null : (
              <p className="px-3 pt-0.5 text-xs text-muted-foreground">
                {USAGE_LIMIT_WAKE_HINT}
              </p>
            )}
          </div>
        )}
      </m.div>
    );
  }

  return <AnimatePresence initial={false}>{card}</AnimatePresence>;
}
