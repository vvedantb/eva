"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";

/**
 * A "working" pip, not a count: there is only ever one Manager Ave, so the
 * question is "is it running a turn right now".
 *
 * Its own file because two summon buttons carry it — the floating launcher on
 * desktop and the mobile header button — and they must not drift apart.
 * Absolutely positioned against whichever button hosts it.
 */
export function AveActiveDot() {
  const thread = useQuery(api.ave.getThread, {});
  if (thread?.status !== "running") return null;
  return (
    <>
      <span
        className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-success ring-2 ring-background"
        aria-hidden
      />
      <span className="sr-only">Manager Ave is working</span>
    </>
  );
}
