"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";

/**
 * A dot, not a count: there is only ever one Manager Ave, so the question is
 * "is its sandbox up", not "how many". Same semantics the rail tile used before
 * the launcher took the query over.
 *
 * Its own file because two summon buttons carry it now — the floating launcher
 * on desktop and the mobile header button — and they must not drift apart.
 * Absolutely positioned against whichever button hosts it.
 */
export function AveActiveDot() {
  const orchestrator = useQuery(api.sessions.getOrchestratorSession, {});
  if (orchestrator?.status !== "active") return null;
  return (
    <>
      <span
        className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-success ring-2 ring-background"
        aria-hidden
      />
      <span className="sr-only">Sandbox active</span>
    </>
  );
}
