"use client";

import { useLocalStorage } from "usehooks-ts";

/** localStorage key for tabs the user dismissed from the strip. */
const CLOSED_SESSION_TABS_KEY = "eva:session-tabs:closed";

/** The stored value is user-writable, so anything not an id string is dropped. */
function parseClosedIds(value: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => typeof id === "string");
}

/**
 * Which session tabs the user has closed.
 *
 * Closing a tab is a local, reversible view preference — the session keeps
 * running, keeps its sandbox and keeps its PR. Archiving is the destructive
 * action and stays in the context menu, because a close-shaped control that
 * stops a sandbox and closes a pull request is a trap.
 *
 * A closed session is still listed in the overflow menu, which is how it comes
 * back: opening it from there reopens its tab.
 */
export function useClosedSessionTabs() {
  const [closedIds, setClosedIds] = useLocalStorage<string[]>(
    CLOSED_SESSION_TABS_KEY,
    [],
  );
  const closed = parseClosedIds(closedIds);

  return {
    isClosed: (sessionId: string): boolean => closed.includes(sessionId),
    close: (sessionId: string) => {
      setClosedIds((prev) => {
        const ids = parseClosedIds(prev);
        return ids.includes(sessionId) ? ids : [...ids, sessionId];
      });
    },
    reopen: (sessionId: string) => {
      setClosedIds((prev) =>
        parseClosedIds(prev).filter((id) => id !== sessionId),
      );
    },
  };
}
