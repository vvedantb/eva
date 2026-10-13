import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * The first rendered row, and its offset from the top of the scroll content,
 * when older turns were requested. The batch that loads above it pushes it
 * down by exactly its own height; scrolling by that much keeps the reader's
 * place. Content offsets, not viewport offsets: the reader may keep scrolling
 * while the batch renders, and that must not be undone.
 *
 * CSS scroll anchoring cannot do this: WebKit has none, and Chromium skipped
 * it here in testing (the row moved ~16k px per batch). The transcript turns
 * it off (`overflow-anchor: none` in ChatBody) so no browser corrects twice.
 */
export interface TranscriptScrollAnchor {
  messageId: string;
  contentTop: number;
}

/** Each anchor restores once: later renders must not pull the reader back. */
const restoredAnchors = new WeakSet<TranscriptScrollAnchor>();

/** Starts loading this far before the reader reaches the top. */
const PRELOAD_MARGIN_PX = 1200;

function rowElement(viewport: HTMLElement, messageId: string) {
  return viewport.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  );
}

function contentTop(viewport: HTMLElement, row: HTMLElement): number {
  return (
    row.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top +
    viewport.scrollTop
  );
}

function captureAnchor(
  viewport: HTMLElement,
): TranscriptScrollAnchor | undefined {
  const first = viewport.querySelector<HTMLElement>("[data-message-id]");
  const messageId = first?.dataset.messageId;
  if (!first || !messageId) return undefined;
  return { messageId, contentTop: contentTop(viewport, first) };
}

/**
 * Invisible marker above the rendered window of a long chat. When the reader
 * scrolls near it, `onReach` asks for the next batch of older turns.
 *
 * Keyed by the window's first row, so each batch mounts a fresh marker: its
 * ref callback first restores the scroll anchor of the batch that just
 * loaded, then observes again — still near the top, it loads the next batch.
 * Without `onReach` (the batch reached the top of the chat) it only restores.
 * Must render inside `<Conversation>` (StickToBottom) for the scroll viewport.
 */
export function ChatEarlierTurnsLoader({
  anchor,
  onReach,
}: {
  anchor: TranscriptScrollAnchor | undefined;
  onReach: ((anchor: TranscriptScrollAnchor | undefined) => void) | undefined;
}) {
  const { scrollRef } = useStickToBottomContext();

  const observe = (node: HTMLDivElement | null) => {
    const viewport = scrollRef.current;
    if (!node || !viewport) return;

    if (anchor && !restoredAnchors.has(anchor)) {
      restoredAnchors.add(anchor);
      const row = rowElement(viewport, anchor.messageId);
      if (row) viewport.scrollTop += contentTop(viewport, row) - anchor.contentTop;
    }

    if (!onReach) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        onReach(captureAnchor(viewport));
      },
      {
        root: viewport,
        rootMargin: `${PRELOAD_MARGIN_PX}px 0px 0px 0px`,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  };

  // Zero height, and `-mb-3` cancels the transcript's `gap-3`, so the marker
  // takes no space: the first row sits exactly where it would without it.
  return <div ref={observe} aria-hidden="true" className="-mb-3 h-0 shrink-0" />;
}
