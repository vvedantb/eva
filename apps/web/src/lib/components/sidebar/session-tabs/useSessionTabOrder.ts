"use client";

import { useLocalStorage } from "usehooks-ts";

/** localStorage key for the manual tab order, keyed by repo id. */
const SESSION_TAB_ORDER_KEY = "eva:session-tabs:order";

/** The stored value is user-writable, so non-id-list entries are dropped. */
function parseOrderByRepoId(
  value: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [repoId, ids] of Object.entries(value)) {
    if (!Array.isArray(ids)) continue;
    out[repoId] = ids.filter((id) => typeof id === "string");
  }
  return out;
}

/**
 * The user's manual tab order per app, persisted so a reorder survives a
 * reload. Sessions the order does not mention fall back to creation order —
 * see `mergeSessionTabOrder`.
 */
export function useSessionTabOrder() {
  const [orderByRepoId, setOrderByRepoId] = useLocalStorage<
    Record<string, string[]>
  >(SESSION_TAB_ORDER_KEY, {});
  const parsed = parseOrderByRepoId(orderByRepoId);

  return {
    orderFor: (repoId: string): readonly string[] => parsed[repoId] ?? [],
    setOrderFor: (repoId: string, ids: string[]) => {
      setOrderByRepoId((prev) => ({
        ...parseOrderByRepoId(prev),
        [repoId]: ids,
      }));
    },
  };
}
