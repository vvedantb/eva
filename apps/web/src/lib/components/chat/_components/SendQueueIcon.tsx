import { springTransition } from "@vvedantb/ui";
import { m } from "motion/react";

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type Shape = readonly [Segment, Segment, Segment];

// Both shapes use the same three lines, so the arrow's own strokes move into
// the queue bars instead of one icon fading out and another fading in.
// Arrow points match Tabler's `IconArrowUp` on its 24px grid.
const ARROW: Shape = [
  { x1: 6, y1: 11, x2: 12, y2: 5 },
  { x1: 12, y1: 5, x2: 12, y2: 19 },
  { x1: 18, y1: 11, x2: 12, y2: 5 },
];

const QUEUE: Shape = [
  { x1: 5, y1: 7, x2: 19, y2: 7 },
  { x1: 5, y1: 12, x2: 19, y2: 12 },
  { x1: 19, y1: 17, x2: 5, y2: 17 },
];

/**
 * The composer's send icon. While Eva works a send joins the queue, so the
 * arrow turns into a stack of bars and turns back when the turn ends.
 */
export function SendQueueIcon({ queued }: { queued: boolean }) {
  const shape = queued ? QUEUE : ARROW;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="size-4"
      aria-hidden
    >
      {shape.map((segment, index) => (
        <m.line
          // The index is the identity: line N of the arrow becomes line N of
          // the stack.
          key={index}
          initial={false}
          animate={{
            x1: segment.x1,
            y1: segment.y1,
            x2: segment.x2,
            y2: segment.y2,
          }}
          transition={springTransition}
        />
      ))}
    </svg>
  );
}
