"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { toast } from "@vvedantb/ui";

/**
 * Why a refresh came back with nothing, in the user's terms. Each one names a
 * different next move, which is the only reason they are distinguished at all.
 */
const FAILURE_COPY: Record<string, string> = {
  "no-token": "This account has no Claude OAuth token connected.",
  unauthorized: "Claude rejected the token. Reconnect the account in Settings.",
  unavailable: "Claude isn't reporting plan rate limits for this account.",
  network: "Couldn't reach Claude. Try again.",
  "rate-limited":
    "Claude rate-limited the usage lookup. Try again in a moment.",
};

const GENERIC_FAILURE = "Couldn't refresh plan usage.";

/** One account's outcome, derived from the action so the two cannot drift. */
type RefreshOutcome = FunctionReturnType<
  typeof api.usageLimitsActions.refreshAll
>["results"][number];

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
 * to report one. The card calls it on open, so it is never stale by the time
 * someone looks — there is no manual button.
 *
 * Nothing is invalidated on success: `getForViewer` is a live query, so the open
 * card updates itself the moment a row is written. A second open while one is
 * in flight is dropped rather than doubling the probes.
 */
export function useRefreshUsage(repoId: Id<"githubRepos">) {
  const refreshAll = useAction(api.usageLimitsActions.refreshAll);
  const [pending, setPending] = useState(false);

  const refresh = async () => {
    if (pending) return;
    setPending(true);
    let results: readonly RefreshOutcome[] = [];
    try {
      const response = await refreshAll({ repoId });
      results = response.results;
    } catch {
      // A server throw carries Convex internals (request id, stack), which is
      // not copy for a toast — every named failure already arrives as a reason.
      toast.error(GENERIC_FAILURE);
    }
    setPending(false);
    for (const result of results) reportOutcome(result);
  };

  return { refresh, pending };
}
