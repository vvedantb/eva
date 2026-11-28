import { animate } from "motion/react";
import { cn } from "@eva/ui";
import { EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

const GROUPED = new Intl.NumberFormat("en-GB").format;

interface AnnCCountDownProps {
  from: number;
  to: number;
  step?: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  fromText?: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts a figure *down* once the deck reaches `step`. `CountUp` always starts
 * at zero, which reads as growth; several annual slides are about a number
 * falling, and the direction is the argument. Like `CountUp`, the text is
 * written straight to the node so the count does not re-render the slide.
 */
export function AnnCCountDown({
  from,
  to,
  step = 0,
  duration = 1.4,
  delay = 0,
  decimals = 0,
  fromText,
  suffix = "",
  className,
}: AnnCCountDownProps) {
  const running = useDeckStep() >= step;
  const text = (n: number) =>
    `${decimals > 0 ? n.toFixed(decimals) : GROUPED(Math.round(n))}${suffix}`;

  return (
    <span
      key={running ? "on" : "off"}
      className={cn("tabular-nums", className)}
      ref={(el) => {
        if (!el || !running) return;
        const controls = animate(from, to, {
          duration,
          delay,
          ease: EASE_OUT,
          onUpdate: (value) => {
            el.textContent = text(value);
          },
        });
        return () => controls.stop();
      }}
    >
      {fromText ?? text(from)}
    </span>
  );
}
