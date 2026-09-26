import { useId } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckTheme, useMotionCue } from "../deckContext";
import { BRAND, EASE, cueTransition } from "./tokens";

export interface Point {
  x: number;
  y: number;
}

export interface ConnectorProps {
  /** Endpoints in pixels of the parent, which must be `relative`. */
  from: Point;
  to: Point;
  /** Bow the line by this many pixels, perpendicular to it. 0 is straight. */
  bend?: number;
  /** Build step to connect on. Omit to follow the enclosing `Reveal`/`Stagger`. */
  step?: number;
  delay?: number;
  /** Keep work flowing along the line once it has drawn. */
  flow?: boolean;
  /** Seconds for one dash to travel one period. Larger is calmer. */
  flowPeriod?: number;
  strokeWidth?: number;
  className?: string;
}

const DASH = 6;
const GAP = 14;
const TRACK = { dark: "rgba(255,255,255,0.14)", light: "rgba(9,9,11,0.14)" };

function pathBetween(from: Point, to: Point, bend: number): string {
  if (bend === 0) return `M${from.x} ${from.y} L${to.x} ${to.y}`;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const cx = (from.x + to.x) / 2 - (dy / length) * bend;
  const cy = (from.y + to.y) / 2 + (dx / length) * bend;
  return `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`;
}

/**
 * A line between two points that first draws itself, then carries a brand
 * dash pattern flowing from `from` to `to` — the pipeline beat. The flow is a
 * `stroke-dashoffset` loop on one thin path, so keep it to a few per slide.
 *
 * @example <Connector from={{ x: 220, y: 180 }} to={{ x: 520, y: 180 }} step={1} flow />
 */
export function Connector({
  from,
  to,
  bend = 0,
  step,
  delay = 0,
  flow = true,
  flowPeriod = 0.9,
  strokeWidth = 2,
  className,
}: ConnectorProps) {
  const { on, delay: start } = useMotionCue(step, delay);
  const gradientId = useId();
  const d = pathBetween(from, to, bend);
  const draw = cueTransition(on, start, { duration: 0.8, ease: EASE.inOut });

  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 size-full overflow-visible",
        className,
      )}
      fill="none"
    >
      <linearGradient
        id={gradientId}
        gradientUnits="userSpaceOnUse"
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
      >
        <stop offset="0%" stopColor={BRAND.purple} />
        <stop offset="100%" stopColor={BRAND.blue} />
      </linearGradient>
      <m.path
        d={d}
        stroke={TRACK[useDeckTheme()]}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: on ? 1 : 0 }}
        transition={draw}
      />
      {flow && (
        <m.path
          d={d}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${DASH} ${GAP}`}
          initial={{ opacity: 0, strokeDashoffset: 0 }}
          animate={{
            opacity: on ? 1 : 0,
            strokeDashoffset: on ? [0, -(DASH + GAP)] : 0,
          }}
          transition={{
            opacity: { duration: 0.4, delay: on ? start + 0.6 : 0 },
            strokeDashoffset: on
              ? { duration: flowPeriod, ease: "linear", repeat: Infinity }
              : { duration: 0 },
          }}
        />
      )}
    </svg>
  );
}
