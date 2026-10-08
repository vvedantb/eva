/**
 * Search param carrying the comment a notification was generated from.
 *
 * A comment notification links to the page holding the comment (a task's
 * activity timeline, a doc's comment panel), which on a busy task can be a long
 * scroll away. The comment id rides along in this param so the page can bring
 * that exact comment into view. Notifications created before this existed carry
 * no param and land at the top of the page as they always did.
 */
export const COMMENT_ANCHOR_PARAM = "comment";

/**
 * Appends the comment anchor to a notification href. Kept separate from href
 * construction so every notification path — derived href or explicitly passed —
 * gets the same param, spelled the same way the reader parses it.
 */
export function withCommentAnchor(href: string, commentId: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${COMMENT_ANCHOR_PARAM}=${encodeURIComponent(commentId)}`;
}
