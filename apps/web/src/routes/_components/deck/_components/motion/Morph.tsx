import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckStep } from "../deckContext";
import { DUR, EASE } from "./tokens";

export interface MorphProps {
  /**
   * One state per build step, like `Camera` shots: `states[0]` rests, the
   * next arrives on step 1, and the last holds for any step beyond it.
   */
  states: readonly ReactNode[];
  /** Deck step that shows `states[0]`. Shift it when the swap starts later in the slide. */
  from?: number;
  /**
   * A 6px focus-pull on the swap. Only for element-sized content (under about
   * 400px); turn it off for anything larger — it is a per-frame filter.
   */
  blur?: boolean;
  className?: string;
}

/**
 * The before → after beat. Both states stack in one grid cell, so the box
 * holds its size while the old state recedes (scale down, fade) and the new
 * one arrives from slightly larger. Exits run at half the enter duration.
 *
 * @example <Morph states={[<OldFlow key="old" />, <NewFlow key="new" />]} from={1} />
 */
export function Morph({
  states,
  from = 0,
  blur = true,
  className,
}: MorphProps) {
  const step = useDeckStep();
  const index = Math.max(0, Math.min(step - from, states.length - 1));
  const focus = (px: number) => (blur ? { filter: `blur(${px}px)` } : {});

  return (
    <div className={cn("grid", className)}>
      <AnimatePresence mode="sync">
        <m.div
          key={index}
          className="[grid-area:1/1]"
          initial={{ opacity: 0, scale: 1.04, ...focus(6) }}
          animate={{
            opacity: 1,
            scale: 1,
            ...focus(0),
            transitionEnd: blur ? { filter: "none" } : {},
          }}
          exit={{
            opacity: 0,
            scale: 0.96,
            ...focus(6),
            transition: { duration: DUR.base, ease: EASE.in },
          }}
          transition={{ duration: DUR.slow, ease: EASE.expo, delay: 0.08 }}
        >
          {states[index]}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
