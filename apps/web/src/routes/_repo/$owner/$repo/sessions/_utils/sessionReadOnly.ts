import type { PrState } from "@eva/shared";

/**
 * `archived` is the one session lock. A merged/closed PR locks the session
 * only through the server's auto-archive, so the owner's "Disable
 * auto-archive" flag (or a manual unarchive) keeps it live and writable.
 */
export function isSessionSidebarActive(session: {
  archived?: boolean;
}): boolean {
  return session.archived !== true;
}

// Moved to `@eva/shared` so the phone menus offer it under the same rule.
export { canSendSessionForReview } from "@eva/shared";


/**
 * Banner copy for an archived session. A merged/closed PR names the reason
 * the session locked (reopen on GitHub unlocks again); a live session has none.
 */
export function getSessionReadOnlyMessage(args: {
  isArchived: boolean;
  prState: PrState | undefined;
}): string | undefined {
  if (!args.isArchived) return undefined;
  if (args.prState === "merged") {
    return "This PR has been merged, so this session is now read-only.";
  }
  if (args.prState === "closed") {
    return "This PR has been closed, so this session is now read-only.";
  }
  return "This session is archived and read-only";
}
