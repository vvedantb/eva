"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import { toast } from "@vvedantb/ui";
import {
  USAGE_REFRESH_FAILED,
  usageRefreshFailure,
  type UsageRefreshOutcome,
} from "@eva/shared/usageLimits";

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
    let results: readonly UsageRefreshOutcome[] = [];
    try {
      const response = await refreshAll({ repoId });
      results = response.results;
    } catch {
      // A server throw carries Convex internals (request id, stack), which is
      // not copy for a toast — every named failure already arrives as a reason.
      toast.error(USAGE_REFRESH_FAILED);
    }
    setPending(false);
    for (const result of results) {
      const failure = usageRefreshFailure(result);
      if (failure) toast.error(failure);
    }
  };

  return { refresh, pending };
}
