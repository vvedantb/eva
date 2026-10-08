"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { Button, CrossfadeIcon, Spinner, toast } from "@eva/ui";
import { IconRefresh } from "@tabler/icons-react";

/**
 * Why a refresh came back with nothing, in the user's terms. Each one names a
 * different next move, which is the only reason they are distinguished at all.
 */
const FAILURE_COPY: Record<string, string> = {
  "no-token": "This account has no Claude OAuth token connected.",
  unauthorized: "Claude rejected the token. Reconnect the account in Settings.",
  unavailable: "Claude isn't reporting plan rate limits for this account.",
  network: "Couldn't reach Claude. Try again.",
  "rate-limited": "Claude rate-limited the usage lookup. Try again in a moment.",
};

const GENERIC_FAILURE = "Couldn't refresh plan usage.";

/** One account's outcome, derived from the action so the two cannot drift. */
type RefreshOutcome = FunctionReturnType<
  typeof api.usageLimitsActions.refreshAll
>["results"][number];

interface UsageRefreshButtonProps {
  repoId: Id<"githubRepos">;
}

/**
 * Failures are named per account: several credentials are read at once, and
 * "Couldn't reach Claude" is no use without knowing whose token it was.
 */
function reportOutcome(result: RefreshOutcome): void {
  if (result.ok) return;
  const copy = FAILURE_COPY[result.reason ?? ""] ?? GENERIC_FAILURE;
  toast.error(`${result.accountLabel}: ${copy}`);
}

/**
 * Pulls a reading for every credential now instead of waiting for the next turn
 * to report one. One button rather than one per row: the card lists accounts
 * that have never reported, and filling those in is the whole point of asking.
 *
 * Nothing is invalidated on success: `getForViewer` is a live query, so the card
 * the button sits in updates itself the moment a row is written.
 */
export function UsageRefreshButton({ repoId }: UsageRefreshButtonProps) {
  const refresh = useAction(api.usageLimitsActions.refreshAll);
  const [pending, setPending] = useState(false);

  const onRefresh = async () => {
    setPending(true);
    let results: readonly RefreshOutcome[] = [];
    try {
      const response = await refresh({ repoId });
      results = response.results;
    } catch {
      // A server throw carries Convex internals (request id, stack), which is
      // not copy for a toast — every named failure already arrives as a reason.
      toast.error(GENERIC_FAILURE);
    }
    setPending(false);
    for (const result of results) reportOutcome(result);
  };

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Refresh plan usage"
      disabled={pending}
      onClick={() => {
        void onRefresh();
      }}
    >
      <CrossfadeIcon
        show={pending}
        trueKey="loading"
        falseKey="idle"
        variant="soft"
        className="relative flex size-3.5 items-center justify-center"
        whenTrue={<Spinner size="sm" />}
        whenFalse={<IconRefresh size={14} />}
      />
    </Button>
  );
}
