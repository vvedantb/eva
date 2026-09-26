import { Children, isValidElement } from "react";
import type { ReactNode } from "react";
import { m } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";
import { MotionCueContext, useDeckStep } from "./deckContext";
import { Body, Kicker, Title } from "./DeckText";
import { MaskedText } from "./motion/MaskedText";
import { DUR, EASE } from "./motion/tokens";

/*
 * The slide vocabulary. Contexts, tokens and the self-animating type
 * primitives live in their own files; they are re-exported here so every slide
 * keeps a single import.
 */
export {
  DeckStepContext,
  DeckThemeContext,
  useDeckStep,
  useDeckTheme,
  useMotionCue,
} from "./deckContext";
export type { DeckTheme } from "./deckContext";
export { BRAND, EASE_OUT } from "./motion/tokens";
export { Accent } from "./DeckAccent";
export { Body, Footnote, Kicker, Shell, Title } from "./DeckText";
export { Card } from "./DeckSurface";

type RevealFrom = "up" | "down" | "left" | "right" | "none";

function offset(from: RevealFrom, distance: number): { x: number; y: number } {
  switch (from) {
    case "up":
      return { x: 0, y: distance };
    case "down":
      return { x: 0, y: -distance };
    case "left":
      return { x: -distance, y: 0 };
    case "right":
      return { x: distance, y: 0 };
    case "none":
      return { x: 0, y: 0 };
  }
}

const TEXT_TAGS = new Set(["p", "span", "strong", "em", "h1", "h2", "h3"]);

/**
 * True when every child is a line of text. Blur reads as focus pulling on a
 * sentence, but on a chart or a panel it is a full-layer filter every frame,
 * so only text-sized reveals get it.
 */
function isTextual(children: ReactNode): boolean {
  return Children.toArray(children).every(
    (child) =>
      typeof child === "string" ||
      typeof child === "number" ||
      (isValidElement(child) &&
        ((typeof child.type === "string" && TEXT_TAGS.has(child.type)) ||
          child.type === Body)),
  );
}

/** Titles and kickers bring their own entrance; a reveal around them only times it. */
function isSelfAnimating(children: ReactNode): boolean {
  return Children.toArray(children).every(
    (child) =>
      isValidElement(child) &&
      (child.type === Title ||
        child.type === Kicker ||
        child.type === MaskedText),
  );
}

/** Soft rise: the fade finishes early, the travel decelerates long after. */
const RISE: Transition = {
  duration: DUR.hero,
  ease: EASE.expo,
  opacity: { duration: DUR.slow, ease: EASE.out },
};
const TEXT_BLUR = "blur(4px)";

function risePair(
  x: number,
  y: number,
  blur: boolean,
): { hidden: TargetAndTransition; shown: TargetAndTransition } {
  return {
    hidden: { opacity: 0, x, y, ...(blur && { filter: TEXT_BLUR }) },
    shown: {
      opacity: 1,
      x: 0,
      y: 0,
      // A resting `blur(0px)` would still flatten 3D and make a layer.
      ...(blur && { filter: "blur(0px)", transitionEnd: { filter: "none" } }),
    },
  };
}

interface RevealProps {
  children: ReactNode;
  step?: number;
  delay?: number;
  className?: string;
  from?: RevealFrom;
  distance?: number;
  /** Defaults to a 4px focus-pull on text-only children, none on anything else. */
  blur?: boolean;
}

/**
 * Fades and rises its children in once the deck reaches `step`. Children are
 * never unmounted, so measured layout stays stable across the build. Wrapping
 * only a `Title`/`Kicker`, it leaves the motion to them and just times it.
 */
export function Reveal({
  children,
  step = 0,
  delay = 0,
  className,
  from = "up",
  distance = 16,
  blur,
}: RevealProps) {
  const visible = useDeckStep() >= step;
  const cue = { on: visible, delay };

  if (isSelfAnimating(children)) {
    return (
      <div className={className}>
        <MotionCueContext value={cue}>{children}</MotionCueContext>
      </div>
    );
  }

  const { x, y } = offset(from, distance);
  const { hidden, shown } = risePair(x, y, blur ?? isTextual(children));

  return (
    <m.div
      initial={hidden}
      animate={visible ? shown : hidden}
      transition={visible ? { ...RISE, delay } : { duration: DUR.fast }}
      className={className}
    >
      <MotionCueContext value={cue}>{children}</MotionCueContext>
    </m.div>
  );
}

interface StaggerProps {
  children: ReactNode;
  step?: number;
  delayChildren?: number;
  staggerChildren?: number;
  className?: string;
}

/**
 * Container half of the stagger pair. Wrap each child in `StaggerItem`. Each
 * child also gets its own cue, so an `Accent` or `Card` inside the fifth item
 * plays when the fifth item lands, not when the first does.
 */
export function Stagger({
  children,
  step = 0,
  delayChildren = 0.1,
  staggerChildren = 0.08,
  className,
}: StaggerProps) {
  const visible = useDeckStep() >= step;
  return (
    <m.div
      initial="hidden"
      animate={visible ? "show" : "hidden"}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren, delayChildren } },
      }}
      className={className}
    >
      {Children.toArray(children).map((child, index) => (
        <MotionCueContext
          key={isValidElement(child) && child.key !== null ? child.key : index}
          value={{
            on: visible,
            delay: delayChildren + index * staggerChildren,
          }}
        >
          {child}
        </MotionCueContext>
      ))}
    </m.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { hidden, shown } = risePair(0, 18, isTextual(children));
  return (
    <m.div
      variants={{ hidden, show: shown }}
      transition={RISE}
      className={className}
    >
      {children}
    </m.div>
  );
}
