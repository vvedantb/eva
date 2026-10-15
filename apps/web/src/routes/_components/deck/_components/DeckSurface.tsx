import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckTheme, useMotionCue } from "./deckContext";
import type { DeckTheme } from "./deckContext";
import { EASE } from "./motion/tokens";

interface CardLight {
  /** The soft wash under the top edge, always there. */
  highlight: string;
  /** The travelling edge light, seen once on entry. */
  edge: string;
}

const LIGHT: Record<DeckTheme, CardLight> = {
  dark: {
    highlight: "linear-gradient(180deg, rgba(255,255,255,0.045), transparent)",
    edge: "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
  },
  light: {
    highlight: "linear-gradient(180deg, rgba(255,255,255,0.7), transparent)",
    edge: "linear-gradient(90deg, transparent, rgba(139,63,184,0.45), transparent)",
  },
};

/** The edge light waits for the card to settle, then crosses in just over a second. */
const EDGE_LEAD = 0.3;
const EDGE_DURATION = 1.2;

/**
 * A tone-only surface. On entry a hairline of light travels once along its top
 * edge, over a very soft highlight that makes the top read as lit. Both layers
 * sit behind the content (`isolate` + `-z-10`) and inside their own clip, so the
 * card itself never clips its children. Inside a `Reveal`/`Stagger` the sweep
 * waits for that reveal.
 */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { on, delay } = useMotionCue(undefined, EDGE_LEAD);
  const light = LIGHT[useDeckTheme()];

  return (
    <div
      className={cn(
        "relative isolate rounded-2xl bg-white/[0.05] p-6",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
      >
        <span
          className="absolute inset-x-0 top-0 h-2/5"
          style={{ background: light.highlight }}
        />
        <m.span
          className="absolute top-0 left-0 h-px w-1/2"
          style={{ background: light.edge }}
          initial={{ x: "-100%", opacity: 0 }}
          animate={
            on
              ? { x: "200%", opacity: [0, 1, 1, 0] }
              : { x: "-100%", opacity: 0 }
          }
          transition={
            on
              ? {
                  x: { duration: EDGE_DURATION, ease: EASE.inOut, delay },
                  opacity: {
                    duration: EDGE_DURATION,
                    times: [0, 0.2, 0.75, 1],
                    delay,
                  },
                }
              : { duration: 0 }
          }
        />
      </span>
      {children}
    </div>
  );
}
