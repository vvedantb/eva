"use client";

import type { ReactNode } from "react";
import { m, AnimatePresence, type Transition } from "motion/react";

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
};

const SOFT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SOFT_TRANSITION: Transition = {
  duration: 0.15,
  ease: SOFT_EASE,
};

const DEFAULT_ICON_MOTION = {
  initial: { scale: 0.25, opacity: 0, filter: "blur(4px)" },
  animate: { scale: 1, opacity: 1, filter: "blur(0px)" },
  exit: { scale: 0.25, opacity: 0, filter: "blur(4px)" },
  transition: DEFAULT_TRANSITION,
};

/** Near-imperceptible swap for high-frequency toggles (150ms, no blur). */
const SOFT_ICON_MOTION = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: SOFT_TRANSITION,
};

interface CrossfadeIconProps {
  show: boolean;
  whenTrue: ReactNode;
  whenFalse: ReactNode;
  trueKey?: string;
  falseKey?: string;
  className?: string;
  /** `soft` = opacity + scale(0.96→1), no blur — for tens/day toggles. */
  variant?: "default" | "soft";
}

/** Cross-fades between two icons in the same slot. */
export function CrossfadeIcon({
  show,
  whenTrue,
  whenFalse,
  trueKey = "on",
  falseKey = "off",
  className = "relative flex size-5 items-center justify-center",
  variant = "default",
}: CrossfadeIconProps) {
  const motion = variant === "soft" ? SOFT_ICON_MOTION : DEFAULT_ICON_MOTION;

  return (
    <span className={className}>
      <AnimatePresence initial={false}>
        {show ? (
          <m.span
            key={trueKey}
            className="absolute inset-0 flex items-center justify-center"
            initial={motion.initial}
            animate={motion.animate}
            exit={motion.exit}
            transition={motion.transition}
          >
            {whenTrue}
          </m.span>
        ) : (
          <m.span
            key={falseKey}
            className="absolute inset-0 flex items-center justify-center"
            initial={motion.initial}
            animate={motion.animate}
            exit={motion.exit}
            transition={motion.transition}
          >
            {whenFalse}
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Cross-fades between any number of keyed icons in the same slot.
 *
 * `CrossfadeIcon` covers the two-state case, which is most of them. A control
 * that cycles through three or more states (the composer's submit button:
 * send, submitting, streaming, error) needs the key to come from the state
 * rather than from a boolean.
 */
export function CrossfadeIconSlot({
  iconKey,
  children,
  className = "relative flex size-4 items-center justify-center",
  variant = "soft",
}: {
  /** Identity of the icon currently shown; a change triggers the swap. */
  iconKey: string;
  children: ReactNode;
  className?: string;
  variant?: "default" | "soft";
}) {
  const motion = variant === "soft" ? SOFT_ICON_MOTION : DEFAULT_ICON_MOTION;

  return (
    <span className={className}>
      <AnimatePresence initial={false}>
        <m.span
          key={iconKey}
          className="absolute inset-0 flex items-center justify-center"
          initial={motion.initial}
          animate={motion.animate}
          exit={motion.exit}
          transition={motion.transition}
        >
          {children}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
