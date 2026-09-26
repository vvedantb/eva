import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckTheme, useMotionCue } from "../deckContext";
import { EASE } from "./tokens";

export interface SheenProps {
  children: ReactNode;
  /** Build step to pass on. Omit to follow the enclosing `Reveal`/`Stagger`. */
  step?: number;
  delay?: number;
  duration?: number;
  /** Put the rounding here so the band is clipped to the same shape as the child. */
  className?: string;
}

const BAND = {
  dark: "linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.16) 50%, transparent 80%)",
  light:
    "linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.75) 50%, transparent 80%)",
};

/**
 * Passes one band of light across whatever it wraps — the "this one" beat for
 * a key card or number. The band is a transformed layer clipped to the wrapper,
 * so it costs one composited move and never repaints the child.
 *
 * @example <Sheen step={2} className="rounded-2xl"><Card>…</Card></Sheen>
 */
export function Sheen({
  children,
  step,
  delay = 0,
  duration = 1.1,
  className,
}: SheenProps) {
  const { on, delay: start } = useMotionCue(step, delay);
  const band = BAND[useDeckTheme()];

  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      {children}
      <m.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-2/3"
        style={{ background: band }}
        initial={{ x: "-100%" }}
        animate={{ x: on ? "160%" : "-100%" }}
        transition={
          on
            ? { duration, ease: EASE.inOut, delay: start }
            : { duration: 0 }
        }
      />
    </div>
  );
}
