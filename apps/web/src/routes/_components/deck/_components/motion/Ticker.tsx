import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useMotionCue } from "../deckContext";
import { DUR, EASE } from "./tokens";

export interface TickerProps {
  /** The chips (or anything inline) to scroll. Rendered twice for a seamless loop. */
  items: readonly ReactNode[];
  /** Seconds for one full lap. Larger is calmer; 30–60 reads as ambient. */
  duration?: number;
  /** Scroll left to right instead. */
  reverse?: boolean;
  /** Gap between items, in pixels. Also used between the two copies. */
  gap?: number;
  /** Build step to fade in on. Omit to follow the enclosing `Reveal`/`Stagger`. */
  step?: number;
  delay?: number;
  className?: string;
}

const EDGE_FADE =
  "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)";

/**
 * A slow, endless horizontal scroll — for the "and a great many more" moment.
 * One track holds the items twice and slides by exactly half its width on a
 * linear loop, so the lap never seams. One transform, one infinite animation.
 *
 * @example <Ticker items={SKILLS.map((s) => <Chip key={s}>{s}</Chip>)} duration={45} />
 */
export function Ticker({
  items,
  duration = 40,
  reverse = false,
  gap = 12,
  step,
  delay = 0,
  className,
}: TickerProps) {
  const { on, delay: start } = useMotionCue(step, delay);
  const lap = reverse ? ["-50%", "0%"] : ["0%", "-50%"];

  return (
    <m.div
      className={cn("overflow-hidden", className)}
      style={{ maskImage: EDGE_FADE }}
      initial={{ opacity: 0 }}
      animate={{ opacity: on ? 1 : 0 }}
      transition={{
        duration: DUR.slow,
        ease: EASE.out,
        delay: on ? start : 0,
      }}
    >
      <m.div
        className="flex w-max"
        animate={{ x: lap }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1}
            className="flex shrink-0 items-center"
            style={{ gap, paddingRight: gap }}
          >
            {items}
          </div>
        ))}
      </m.div>
    </m.div>
  );
}

/** Same component; "marquee" is the name designers tend to reach for. */
export const Marquee = Ticker;
