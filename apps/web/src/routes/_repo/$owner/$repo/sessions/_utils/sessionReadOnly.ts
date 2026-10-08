export type SessionPrState = "draft" | "open" | "merged" | "closed";

/** PR terminal states — session is hard-locked until GitHub reopens the PR. */
export function isSessionPrReadOnly(
  prState: SessionPrState | undefined,
): boolean {
  return prState === "merged" || prState === "closed";
}

/**
 * Session still in play for sidebar badges: not manually archived, and PR is
 * still draft/open (or no PR yet).
 */
export function isSessionSidebarActive(session: {
  archived?: boolean;
  prState?: SessionPrState;
}): boolean {
  if (session.archived === true) return false;
  return !isSessionPrReadOnly(session.prState);
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
 * Banner copy for session read-only. PR closed/merged wins over archive so the
 * user sees why the session locked (reopen on GitHub unlocks again).
 */
export function getSessionReadOnlyMessage(args: {
  isArchived: boolean;
  prState: SessionPrState | undefined;
}): string | undefined {
  if (args.prState === "merged") {
    return "This PR has been merged, so this session is now read-only.";
  }
  if (args.prState === "closed") {
    return "This PR has been closed, so this session is now read-only.";
  }
  if (args.isArchived) {
    return "This session is archived and read-only";
  }
  return undefined;
}
