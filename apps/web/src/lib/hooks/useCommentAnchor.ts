"use client";

import { useRef } from "react";
import { useQueryState } from "nuqs";
import { COMMENT_ANCHOR_PARAM } from "@eva/backend";
import { commentAnchorParser } from "@/lib/search-params";

/**
 * The comment a click-through is aimed at, or `null` for a plain visit.
 *
 * Set by comment notifications (`?comment=<id>`). Notifications created before
 * the anchor existed carry no param, so every reader falls back to the
 * unanchored behaviour on its own.
 */
export function useCommentAnchorId(): string | null {
  const [anchorId] = useQueryState(COMMENT_ANCHOR_PARAM, commentAnchorParser);
  return anchorId;
}

/**
 * Brings the anchored comment into view and flashes it.
 *
 * Returns `{ ref, isAnchored }`: put `ref` on the comment's root element and
 * `isAnchored` behind the `t-anchor-flash` class.
 *
 * A ref callback, not an effect. The comment list only renders once its query
 * resolves, so the element mounting *is* the "the comment is on screen now"
 * signal — an effect would have to watch loading state to work out when to
 * look, and would fire too early on the first pass. React re-invokes the
 * callback when the closed-over anchor changes, which is exactly when a second
 * notification for the same page should re-scroll.
 *
 * `matchesReplyId` covers surfaces that render a whole thread as one block: a
 * reply has its own id in the notification, but the thread card is what
 * scrolls.
 */
export function useCommentAnchor(
  commentId: string,
  matchesReplyId?: (anchorId: string) => boolean,
): { ref: (node: HTMLElement | null) => void; isAnchored: boolean } {
  const anchorId = useCommentAnchorId();
  const isAnchored =
    anchorId !== null &&
    (anchorId === commentId || (matchesReplyId?.(anchorId) ?? false));

  const scrolledAnchorRef = useRef<string | null>(null);

  const ref = (node: HTMLElement | null) => {
    if (!node) return;
    if (!isAnchored) {
      scrolledAnchorRef.current = null;
      return;
    }
    if (scrolledAnchorRef.current === anchorId) return;
    scrolledAnchorRef.current = anchorId;
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return { ref, isAnchored };
}
