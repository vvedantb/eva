import { createContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMotionCue } from "./deckContext";
import { ACCENT_GRADIENT } from "./motion/tokens";

/** Accent text waits this long after its words land (kept for `Title`). */
const SHEEN_LEAD = 0.55;

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

/**
 * True inside an `Accent`. Gradient text is clipped to the glyphs of the
 * element that owns the background, and moving descendants (odometer columns)
 * escape that clip, so they read this and paint their own slice instead.
 */
export const InAccentContext = createContext(false);

/** A static slice of the brand gradient, for a glyph that moves on its own. Pair with `bg-clip-text text-transparent`. */
export function accentSliceStyle(slice: AccentSlice): CSSProperties {
  const { size, position } = sliceGeometry(slice);
  return {
    backgroundImage: ACCENT_GRADIENT,
    backgroundSize: `${size} 100%`,
    backgroundPosition: `${position} 0%`,
    backgroundRepeat: "no-repeat",
  };
}

interface AccentTextProps {
  children: ReactNode;
  on: boolean;
  delay: number;
  slice?: AccentSlice;
}

/**
 * Gradient text. `Accent` and `Title` both render this. No sheen: a light band
 * on every accented phrase read as noise, so emphasis comes from the colour
 * and the reveal alone. `on`/`delay` stay in the signature for callers.
 */
export function AccentText({ children, slice }: AccentTextProps) {
  const { size, position } = sliceGeometry(slice);
  return (
    <span
      className="bg-clip-text text-transparent"
      style={{
        backgroundImage: ACCENT_GRADIENT,
        backgroundSize: `${size} 100%`,
        backgroundPosition: `${position} 0%`,
        backgroundRepeat: "no-repeat",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Brand-gradient text. Use sparingly — one phrase per slide.
 */
export function Accent({ children }: { children: ReactNode }) {
  const cue = useMotionCue(undefined, SHEEN_LEAD);
  return (
    <AccentText on={cue.on} delay={cue.delay}>
      <InAccentContext value>{children}</InAccentContext>
    </AccentText>
  );
}

/** How long after its unit lands a sliced accent word starts its sheen. */
export const ACCENT_SHEEN_LEAD = SHEEN_LEAD;
