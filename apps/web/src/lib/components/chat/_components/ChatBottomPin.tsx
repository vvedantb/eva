import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * Lands a chat at its bottom whenever it is shown, and keeps a stuck chat
 * there in the same frame the layout changes.
 *
 * use-stick-to-bottom follows growth from a `requestAnimationFrame`, so the
 * browser first paints the old scroll position. Two layout changes made that
 * frame visible: an opened chat commits its older turns one pass after the
 * last turn (`backlogReady` in ChatBody), and a cached session shown again
 * starts at `scrollTop` 0 (its hidden `<Activity>` was `display: none`). Both
 * painted the top of the transcript for a frame, and a running chat then
 * glided down from there.
 *
 * A ResizeObserver callback runs after layout and before paint, so pinning
 * here leaves the library nothing to animate.
 * - Shown (mount, or a cached session's `<Activity>` turning visible, which
 *   re-attaches this ref): always lands at the bottom, even for a reader who
 *   had scrolled up before switching away. The scroll down re-locks the
 *   library through its own scroll handler.
 * - Afterwards: only a chat stuck to the bottom follows. While a reply
 *   streams (`glide`), growth of less than one viewport is left to the
 *   library, so a live reply still glides down.
 *
 * `glide` is read from the node, not the closure: a new callback would
 * re-attach the observer and count as "shown", pulling a reader down.
 *
 * Must render inside `<Conversation>`.
 */
export function ChatBottomPin({ glide }: { glide: boolean }) {
  const { scrollRef, contentRef, state } = useStickToBottomContext();

  const observe = (node: HTMLDivElement | null) => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!node || !viewport || !content) return;

    let landed = false;
    const observer = new ResizeObserver(() => {
      if (viewport.clientHeight === 0) return;
      const target = state.calculatedTargetScrollTop;
      const gap = target - viewport.scrollTop;
      if (!landed) {
        landed = true;
        if (gap > 0) viewport.scrollTop = target;
        return;
      }
      if (!state.isAtBottom || gap <= 0) return;
      if (node.dataset.glide === "true" && gap < viewport.clientHeight) return;
      viewport.scrollTop = target;
    });
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  };

  return <div ref={observe} data-glide={glide} aria-hidden="true" hidden />;
}
