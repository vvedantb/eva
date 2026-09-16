import { animate } from "motion/react";
import { cn } from "@eva/ui";
import { EASE_OUT, useDeckStep } from "./DeckPrimitives";

const DEFAULT_FORMAT = new Intl.NumberFormat("en-GB").format;

interface CountUpProps {
  value: number;
  duration?: number;
  delay?: number;
  step?: number;
  format?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Counts from zero to `value` once the deck reaches `step`. The number is
 * written straight to the DOM node from the animation loop, so the count does
 * not re-render the slide 60 times a second.
 */
export function CountUp({
  value,
  duration = 1.6,
  delay = 0,
  step = 0,
  format = DEFAULT_FORMAT,
  className,
  prefix = "",
  suffix = "",
}: CountUpProps) {
  const visible = useDeckStep() >= step;
  const text = (n: number) => `${prefix}${format(n)}${suffix}`;

  return (
    <span
      key={visible ? "on" : "off"}
      className={cn("tabular-nums", !visible && "opacity-0", className)}
      ref={(el) => {
        if (!el || !visible) return;
        const controls = animate(0, value, {
          duration,
          delay,
          ease: EASE_OUT,
          onUpdate: (v) => {
            el.textContent = text(Math.round(v));
          },
        });
        return () => controls.stop();
      }}
    >
      {text(0)}
    </span>
  );
}
