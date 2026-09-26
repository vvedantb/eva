import { m } from "motion/react";
import type { Transition } from "motion/react";
import type { DeckTheme } from "./deckContext";
import { EASE } from "./motion/tokens";

const WASH: Record<DeckTheme, string> = {
  dark: "linear-gradient(100deg, transparent 0%, rgba(139,63,184,0.13) 32%, rgba(255,255,255,0.07) 50%, rgba(59,125,216,0.13) 68%, transparent 100%)",
  light:
    "linear-gradient(100deg, transparent 0%, rgba(139,63,184,0.07) 32%, rgba(255,255,255,0.5) 50%, rgba(59,125,216,0.07) 68%, transparent 100%)",
};

/** The band is 70% of the pane: from -100% it starts clear of the left edge, at 143% it has cleared the right. */
const OFF_LEFT = "-100%";
const OFF_RIGHT = "143%";
const DURATION = 0.62;

const SWEEP: Transition = {
  x: { duration: DURATION, ease: EASE.inOut },
  opacity: { duration: DURATION, times: [0, 0.45, 1], ease: "easeInOut" },
};

/**
 * A soft band of brand light that crosses the stage once per slide change, in
 * the direction of travel. `Deck` keys it by slide so each change remounts it.
 * Transform and opacity only; the gradient is painted once.
 */
export function DeckWash({
  direction,
  theme,
}: {
  direction: number;
  theme: DeckTheme;
}) {
  const forward = direction >= 0;
  return (
    <m.div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-[70%]"
      style={{ background: WASH[theme] }}
      initial={{ x: forward ? OFF_LEFT : OFF_RIGHT, opacity: 0 }}
      animate={{ x: forward ? OFF_RIGHT : OFF_LEFT, opacity: [0, 1, 0] }}
      transition={SWEEP}
    />
  );
}
