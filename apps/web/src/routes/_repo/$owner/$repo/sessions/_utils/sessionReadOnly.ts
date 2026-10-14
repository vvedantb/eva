export type SessionPrState = "draft" | "open" | "merged" | "closed";

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

/**
 * "Send for Review" opens (or un-drafts) this session's PR, so it needs a
 * branch to open one from and a PR that is not already out for review.
 *
 * Shared by the session chat header and the sessions sidebar row so the two
 * entry points cannot offer the action under different conditions.
 */
export function canSendSessionForReview(session: {
  branchName?: string;
  prState?: SessionPrState;
}): boolean {
  if (!session.branchName) return false;
  return session.prState === undefined || session.prState === "draft";
}

/**
 * Banner copy for an archived session. A merged/closed PR names the reason
 * the session locked (reopen on GitHub unlocks again); a live session has none.
 */
export function getSessionReadOnlyMessage(args: {
  isArchived: boolean;
  prState: SessionPrState | undefined;
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
