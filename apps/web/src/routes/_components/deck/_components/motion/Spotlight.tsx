import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckStep, useDeckTheme } from "../deckContext";
import type { DeckTheme } from "../deckContext";
import { ACCENT, DUR, EASE, accentMix } from "./tokens";

/** Where the light falls, in pixels of the spotlight's parent. */
export interface SpotlightShot {
  x: number;
  y: number;
  size?: number;
}

export interface SpotlightProps {
  shots: readonly (SpotlightShot | null)[];
  mode?: "glow" | "dim";
  className?: string;
}

const GLOW: Record<DeckTheme, string> = {
  dark: `radial-gradient(circle at center, ${accentMix(ACCENT.a, 40)}, ${accentMix(ACCENT.b, 13)} 45%, transparent 70%)`,
  light: `radial-gradient(circle at center, ${accentMix(ACCENT.a, 12)}, ${accentMix(ACCENT.b, 5)} 45%, transparent 70%)`,
};

const BASE = 100;
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
    : GLOW[theme];

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
