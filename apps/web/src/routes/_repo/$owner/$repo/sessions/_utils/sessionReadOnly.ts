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


// Moved to `@eva/shared` so the phone names the same reason.
export { getSessionReadOnlyMessage } from "@eva/shared";
