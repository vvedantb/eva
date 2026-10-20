"use client";

import { useRef } from "react";
import { useQueryState } from "nuqs";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { toast } from "@eva/ui";
import { messageLinkParser } from "@/lib/search-params";

/** `?message=<id>`: the chat message a shared link points at. */
const MESSAGE_LINK_PARAM = "message";

/**
 * The current page URL aimed at one message. The rest of the URL stays
 * (`?chat=2`, `?subagent=…`), so the link opens the same chat it came from.
 */
export function messageLinkUrl(messageId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(MESSAGE_LINK_PARAM, messageId);
  return url.href;
}

export function copyMessageLink(messageId: string) {
  void navigator.clipboard
    .writeText(messageLinkUrl(messageId))
    .then(() => toast.success("Link copied"));
}

/** The message id a shared link points at, or `null` for a plain visit. */
export function useLinkedMessageId(): string | null {
  const [messageId] = useQueryState(MESSAGE_LINK_PARAM, messageLinkParser);
  return messageId;
}

/**
 * Scrolls a linked message into view once its row is in the DOM. Mount it
 * inside `<Conversation>`, keyed by the message id, after the row renders.
 *
 * A ref callback, not an effect: this node mounts in the same commit as the
 * rows, so its attach is the "the row exists now" signal. `stopScroll` comes
 * first, or stick-to-bottom pulls an opening chat back down to the end.
 */
export function ChatLinkedMessageScroll({ messageId }: { messageId: string }) {
  const { scrollRef, stopScroll } = useStickToBottomContext();
  // React re-attaches a ref whose callback identity changes; scroll only once.
  const scrolledRef = useRef(false);

  const ref = (node: HTMLSpanElement | null) => {
    if (!node || scrolledRef.current) return;
    scrolledRef.current = true;
    stopScroll();
    // One frame of slack: the rows are still laying out on the first commit.
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(messageId)}"]`,
        )
        ?.scrollIntoView({ block: "center" });
    });
  };

  return <span ref={ref} hidden />;
}
