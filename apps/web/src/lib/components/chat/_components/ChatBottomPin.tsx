import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * Keeps a stuck chat at its bottom in the same frame the layout changes.
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
 * here leaves the library nothing to animate. While `glide` (a reply is
 * streaming), growth of less than one viewport is left to the library, so a
 * live reply still glides down. A reader who scrolled up is left alone.
 *
 * Must render inside `<Conversation>`.
 */
export function ChatBottomPin({ glide }: { glide: boolean }) {
  const { scrollRef, contentRef, state } = useStickToBottomContext();

  const observe = (node: HTMLDivElement | null) => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!node || !viewport || !content) return;

    let wasHidden = false;
    const observer = new ResizeObserver(() => {
      const shown = viewport.clientHeight > 0;
      const revealed = wasHidden && shown;
      wasHidden = !shown;
      if (!shown || !state.isAtBottom) return;
      const target = state.calculatedTargetScrollTop;
      const gap = target - viewport.scrollTop;
      if (gap <= 0) return;
      if (glide && !revealed && gap < viewport.clientHeight) return;
      viewport.scrollTop = target;
    });
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  };

  return <div ref={observe} aria-hidden="true" hidden />;
}
