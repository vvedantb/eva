import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useMotionCue } from "../deckContext";
import { BRAND } from "./tokens";

export interface PulseProps {
  /** Wrapped content the rings expand from. Omit for a bare live dot. */
  children?: ReactNode;
  /** Ring and dot colour. */
  color?: string;
  /** Diameter of the bare dot, in pixels. Ignored when wrapping children. */
  size?: number;
  /** Number of rings in flight. Two reads as "live"; three as "alarm". */
  rings?: number;
  /** Seconds per ring. */
  period?: number;
  /** How far a ring grows, as a multiple of the dot or child. */
  reach?: number;
  /** Build step to start on. Omit to follow the enclosing `Reveal`/`Stagger`. */
  step?: number;
  delay?: number;
  className?: string;
}

/**
 * Rings that expand and fade from a dot or a wrapped element — live states and
 * "this needs you" moments. Each ring is a bordered circle scaling up on a
 * linear loop; no shadows, no filters. Counts as `rings` infinite animations.
 *
 * @example <Pulse color={BRAND.blue} /> or <Pulse rings={3}><Avatar /></Pulse>
 */
export function Pulse({
  children,
  color = BRAND.blue,
  size = 10,
  rings = 2,
  period = 2.2,
  reach = 2.6,
  step,
  delay = 0,
  className,
}: PulseProps) {
  const { on, delay: start } = useMotionCue(step, delay);
  const rounded = children ? "rounded-[inherit]" : "rounded-full";

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
    >
      {on &&
        Array.from({ length: rings }, (_, index) => (
          <m.span
            key={index}
            aria-hidden
            className={cn("pointer-events-none absolute inset-0", rounded)}
            style={{ border: `1.5px solid ${color}` }}
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, reach], opacity: [0.7, 0] }}
            transition={{
              duration: period,
              ease: "easeOut",
              repeat: Infinity,
              delay: start + (index * period) / rings,
            }}
          />
        ))}
      {children ?? (
        <span
          className="relative block rounded-full"
          style={{ width: size, height: size, background: color }}
        />
      )}
    </span>
  );
}
