import { use } from "react";
import { animate, m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckStep } from "./deckContext";
import { InAccentContext, accentSliceStyle } from "./DeckAccent";
import { EASE, EASE_OUT, cueTransition } from "./motion/tokens";

const DEFAULT_FORMAT = new Intl.NumberFormat("en-GB").format;

export interface CountUpProps {
  value: number;
  duration?: number;
  delay?: number;
  step?: number;
  format?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
  /**
   * Odometer mode: every digit column rolls up to its value, rightmost first.
   * Off by default, so existing counters keep their smooth count.
   */
  roll?: boolean;
}

/**
 * Counts from zero to `value` once the deck reaches `step`. The number is
 * written straight to the DOM node from the animation loop, so the count does
 * not re-render the slide 60 times a second. With `roll`, the final number is
 * laid out once and each digit column slides instead — no per-frame text.
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
  roll = false,
}: CountUpProps) {
  const visible = useDeckStep() >= step;
  const text = (n: number) => `${prefix}${format(n)}${suffix}`;

  if (roll) {
    return (
      <RollDigits
        text={text(value)}
        on={visible}
        duration={duration}
        delay={delay}
        className={className}
      />
    );
  }

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

/** Two laps of 0–9, so every column travels at least one full turn. */
const CELLS = Array.from({ length: 20 }, (_, index) => index % 10);
/** Each column to the left starts this much later than the one to its right. */
const COLUMN_STAGGER = 0.07;

interface RollDigitsProps {
  text: string;
  on: boolean;
  duration: number;
  delay: number;
  className?: string;
}

/** Columns fade out at the top and bottom edge, like the window of a mechanical counter. */
const COLUMN_WINDOW =
  "linear-gradient(transparent, black 14%, black 86%, transparent)";

function RollDigits({ text, on, duration, delay, className }: RollDigitsProps) {
  const accent = use(InAccentContext);
  const chars = [...text];
  const paint = (index: number) =>
    accent
      ? {
          className: "bg-clip-text text-transparent",
          style: accentSliceStyle({
            start: index,
            length: 1,
            total: chars.length,
          }),
        }
      : {};
  const digits = chars.filter((char) => /\d/.test(char)).length;
  let seen = 0;

  return (
    <span
      aria-label={text}
      role="img"
      className={cn("inline-flex tabular-nums whitespace-nowrap", className)}
    >
      {chars.map((char, index) => {
        if (!/\d/.test(char)) {
          return (
            <m.span
              key={index}
              aria-hidden
              {...paint(index)}
              initial={{ opacity: 0 }}
              animate={{ opacity: on ? 1 : 0 }}
              transition={cueTransition(on, delay)}
            >
              {char === " " ? "\u00A0" : char}
            </m.span>
          );
        }
        seen += 1;
        const at = delay + (digits - seen) * COLUMN_STAGGER;
        const target = 10 + Number(char);
        return (
          <span
            key={index}
            aria-hidden
            className="-my-[0.12em] overflow-hidden py-[0.12em]"
            style={{ height: "calc(1lh + 0.24em)", maskImage: COLUMN_WINDOW }}
          >
            <m.span
              className="block"
              initial={{ y: "0%", opacity: 0 }}
              animate={
                on
                  ? { y: `${(-target / CELLS.length) * 100}%`, opacity: 1 }
                  : { y: "0%", opacity: 0 }
              }
              transition={cueTransition(on, at, {
                duration,
                ease: EASE.expo,
                opacity: { duration: 0.2, delay: at },
              })}
            >
              {CELLS.map((cell, row) => (
                <span key={row} className="block">
                  <span className="block" {...paint(index)}>
                    {cell}
                  </span>
                </span>
              ))}
            </m.span>
          </span>
        );
      })}
    </span>
  );
}
