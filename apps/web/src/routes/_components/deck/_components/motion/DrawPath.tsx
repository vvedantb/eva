import { useId } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useMotionCue } from "../deckContext";
import { BRAND, DUR, EASE, cueTransition } from "./tokens";

export interface DrawPathProps {
  /** SVG path data in pixels of the `width`×`height` box. */
  d: string;
  width: number;
  height: number;
  /** Build step to play on. Omit to follow the enclosing `Reveal`/`Stagger`. */
  step?: number;
  delay?: number;
  duration?: number;
  strokeWidth?: number;
  /** A solid colour. Omit for the brand gradient, purple to blue left to right. */
  color?: string;
  /** Send a glowing dot along the path as it draws, fading at the far end. */
  dot?: boolean;
  className?: string;
}

/** The dot's glow is a static radial gradient, so nothing filters per frame. */
const DOT_GLOW =
  "radial-gradient(circle, #fff 0 22%, rgba(160,140,255,0.55) 34%, transparent 70%)";

/**
 * An SVG path that draws itself, with an optional glowing dot riding the tip.
 * The box has no `viewBox`, so `d` is authored in real pixels — the same space
 * the dot's CSS `offset-path` uses, which keeps the two exactly in step.
 *
 * @example <DrawPath d="M0 60 C 200 0, 400 120, 600 60" width={600} height={120} step={1} dot />
 */
export function DrawPath({
  d,
  width,
  height,
  step,
  delay = 0,
  duration = 1.4,
  strokeWidth = 2,
  color,
  dot = false,
  className,
}: DrawPathProps) {
  const { on, delay: start } = useMotionCue(step, delay);
  const gradientId = useId();
  const draw = cueTransition(on, start, { duration, ease: EASE.inOut });

  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      <svg
        width={width}
        height={height}
        className="absolute inset-0 overflow-visible"
        fill="none"
        aria-hidden
      >
        {/* User-space units: a bounding-box gradient collapses on a flat line. */}
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={width}
          y2={0}
        >
          <stop offset="0%" stopColor={BRAND.purple} />
          <stop offset="100%" stopColor={BRAND.blue} />
        </linearGradient>
        <m.path
          d={d}
          stroke={color ?? `url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={
            on ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }
          }
          transition={{
            ...draw,
            opacity: { duration: DUR.fast, delay: on ? start : 0 },
          }}
        />
      </svg>
      {dot && (
        <m.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 size-5 rounded-full"
          style={{
            background: DOT_GLOW,
            offsetPath: `path("${d}")`,
            offsetRotate: "0deg",
          }}
          initial={{ offsetDistance: "0%", opacity: 0 }}
          animate={
            on
              ? { offsetDistance: "100%", opacity: [0, 1, 1, 0] }
              : { offsetDistance: "0%", opacity: 0 }
          }
          transition={
            on
              ? {
                  offsetDistance: { ...draw },
                  opacity: {
                    duration: duration + 0.3,
                    times: [0, 0.08, 0.8, 1],
                    delay: start,
                  },
                }
              : { duration: 0 }
          }
        />
      )}
    </div>
  );
}
