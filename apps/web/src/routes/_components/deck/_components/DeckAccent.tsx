import type { ReactNode } from "react";
import { m } from "motion/react";
import { useMotionCue } from "./deckContext";
import { BRAND_GRADIENT, EASE } from "./motion/tokens";

/**
 * A bright band on a layer 2.5× the text's width. At 100% the band sits just
 * past the right edge, at 0% just past the left, so sliding the position from
 * 100% to 0% carries it across the text once and leaves nothing behind.
 */
const SHEEN_LAYER =
  "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.9) 50%, transparent 60%)";
const SHEEN_FROM = "100% 0%";
const SHEEN_TO = "0% 0%";

/** The sheen waits for the words around it to land before it passes. */
const SHEEN_LEAD = 0.55;
const SHEEN_DURATION = 1.15;

/**
 * Which part of a longer gradient phrase this piece shows. `Title` splits an
 * `Accent` into one masked unit per word; slicing the gradient by character
 * position keeps it one continuous purple-to-blue sweep across the phrase
 * instead of restarting on every word.
 */
export interface AccentSlice {
  start: number;
  length: number;
  total: number;
}

function sliceGeometry(slice: AccentSlice | undefined): {
  size: string;
  position: string;
} {
  if (!slice || slice.length >= slice.total) {
    return { size: "100%", position: "0%" };
  }
  return {
    size: `${(slice.total / slice.length) * 100}%`,
    position: `${(slice.start / (slice.total - slice.length)) * 100}%`,
  };
}

interface AccentTextProps {
  children: ReactNode;
  on: boolean;
  delay: number;
  slice?: AccentSlice;
}

/** Gradient text plus its one-shot sheen. `Accent` and `Title` both render this. */
export function AccentText({ children, on, delay, slice }: AccentTextProps) {
  const { size, position } = sliceGeometry(slice);
  const at = (sheen: string) => `${sheen}, ${position} 0%`;

  return (
    <m.span
      className="bg-clip-text text-transparent"
      style={{
        backgroundImage: `${SHEEN_LAYER}, ${BRAND_GRADIENT}`,
        backgroundSize: `250% 100%, ${size} 100%`,
        backgroundRepeat: "no-repeat",
      }}
      initial={{ backgroundPosition: at(SHEEN_FROM) }}
      animate={{ backgroundPosition: at(on ? SHEEN_TO : SHEEN_FROM) }}
      transition={
        on
          ? { duration: SHEEN_DURATION, ease: EASE.inOut, delay }
          : { duration: 0 }
      }
    >
      {children}
    </m.span>
  );
}

/**
 * Brand-gradient text. Use sparingly — one phrase per slide. A band of light
 * passes across it once, just after it appears; inside a `Reveal` or
 * `Stagger` it waits for that reveal's step and delay.
 */
export function Accent({ children }: { children: ReactNode }) {
  const cue = useMotionCue(undefined, SHEEN_LEAD);
  return (
    <AccentText on={cue.on} delay={cue.delay}>
      {children}
    </AccentText>
  );
}

/** How long after its unit lands a sliced accent word starts its sheen. */
export const ACCENT_SHEEN_LEAD = SHEEN_LEAD;
