// useEffect: a requestAnimationFrame loop that eases the shown text toward the
// streamed text. Nothing to derive: the shown length depends on time.
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Markdown } from "@vvedantb/ui";

/**
 * Share of the unshown text revealed on each frame. A burst of 400 characters
 * plays out over about half a second; a trickle shows as it arrives.
 */
const REVEAL_PER_FRAME = 0.08;

/**
 * Eases `target` onto the screen while `live` is true, so text that arrives in
 * bursts reads as a steady stream. Text already present on mount shows at
 * once, so a reload or a settled message never replays.
 */
export function useSmoothText(target: string, live: boolean): string {
  const [length, setLength] = useState(target.length);
  const lengthRef = useRef(target.length);

  useEffect(() => {
    if (!live) return;
    // A rewrite can shorten the text; never point past its end.
    lengthRef.current = Math.min(lengthRef.current, target.length);
    let frame = 0;
    function tick() {
      const remaining = target.length - lengthRef.current;
      if (remaining <= 0) return;
      lengthRef.current += Math.max(1, Math.ceil(remaining * REVEAL_PER_FRAME));
      setLength(lengthRef.current);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, live]);

  // Once the stream ends the full text shows at once: no tail to wait for.
  return live ? target.slice(0, length) : target;
}

/**
 * `Markdown` that eases streamed text in. Settled text (`mode` other than
 * "streaming") passes straight through.
 */
export function SmoothMarkdown({
  children,
  ...props
}: ComponentProps<typeof Markdown>) {
  const text = useSmoothText(children, props.mode === "streaming");
  return <Markdown {...props}>{text}</Markdown>;
}
