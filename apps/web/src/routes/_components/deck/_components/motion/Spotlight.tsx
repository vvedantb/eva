import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckStep, useDeckTheme } from "../deckContext";
import { BRAND, DUR, EASE } from "./tokens";

/** Where the light falls, in pixels of the spotlight's parent. */
export interface SpotlightShot {
  x: number;
  y: number;
  /** Diameter of the lit area. Defaults to 360. */
  size?: number;
}

export interface SpotlightProps {
  /** One shot per build step, like `Camera`. `null` switches it off; the last entry holds. */
  shots: readonly (SpotlightShot | null)[];
  /**
   * `glow` (default) lays a soft brand light behind the content — the parent
   * needs `relative isolate`. `dim` darkens everything except the lit circle
   * and sits above the content — the parent needs `relative`.
   */
  mode?: "glow" | "dim";
  className?: string;
}

/** Glow and hole are drawn once at this size and scaled, so moving them is transform-only. */
const BASE = 100;
/** Big enough that the dim layer covers the 1280×720 canvas from any centre. */
const DIM_BOX = 2800;

const MOVE = { duration: DUR.hero, ease: EASE.expo };

/**
 * A "look here" light that glides to a new target on each step. Only its
 * transform and opacity animate; the gradient itself is painted once.
 *
 * @example <Spotlight shots={[null, { x: 320, y: 300 }, { x: 900, y: 300, size: 480 }]} />
 */
export function Spotlight({ shots, mode = "glow", className }: SpotlightProps) {
  const step = useDeckStep();
  const theme = useDeckTheme();
  const shot = shots[Math.min(step, shots.length - 1)] ?? null;
  const last = shot ?? shots.findLast((entry) => entry !== null) ?? null;
  const size = last?.size ?? 360;
  const dim = mode === "dim";
  const box = dim ? DIM_BOX : BASE;

  const background = dim
    ? `radial-gradient(circle at center, transparent ${BASE / 2}px, ${
        theme === "dark" ? "rgba(0,0,0,0.62)" : "rgba(250,250,250,0.7)"
      } ${BASE / 2 + 34}px)`
    : `radial-gradient(circle at center, ${BRAND.purple}66, ${BRAND.blue}22 45%, transparent 70%)`;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        !dim && "-z-10",
        className,
      )}
    >
      <m.div
        className="absolute top-0 left-0 rounded-full"
        style={{ width: box, height: box, background }}
        initial={false}
        animate={{
          x: (last?.x ?? 0) - box / 2,
          y: (last?.y ?? 0) - box / 2,
          scale: size / BASE,
          opacity: shot ? 1 : 0,
        }}
        transition={{ ...MOVE, opacity: { duration: DUR.slow } }}
      />
    </div>
  );
}
