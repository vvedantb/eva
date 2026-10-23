import { animate } from "motion/react";
import { cn } from "@eva/ui";
import { EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

interface AnnBCountDownProps {
  from: number;
  to: number;
  decimals?: number;
  duration?: number;
  delay?: number;
  /** The build step that starts the count. */
  step?: number;
  className?: string;
}

/**
 * Counts a figure down once the deck reaches `step`. `CountUp` always runs from
 * zero, and every figure on the c07/c08 slides is a reduction, so it has to
 * read as a fall from the old number rather than a climb to the new one.
 */
export function AnnBCountDown({
  from,
  to,
  decimals = 0,
  duration = 1.4,
  delay = 0,
  step = 0,
  className,
}: AnnBCountDownProps) {
  const visible = useDeckStep() >= step;

  return (
    <span
      key={visible ? "on" : "off"}
      className={cn("tabular-nums", !visible && "opacity-0", className)}
      ref={(el) => {
        if (!el || !visible) return;
        const controls = animate(from, to, {
          duration,
          delay,
          ease: EASE_OUT,
          onUpdate: (value) => {
            el.textContent = value.toFixed(decimals);
          },
        });
        return () => controls.stop();
      }}
    >
      {from.toFixed(decimals)}
    </span>
  );
}
