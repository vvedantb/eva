import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useMotionCue } from "../deckContext";
import { AccentText } from "../DeckAccent";
import { DUR, EASE, STAGGER, cueTransition } from "./tokens";

export interface SplitRevealProps {
  /** A short hero word or phrase, 20 characters or fewer. */
  text: string;
  /** Build step to play on. Omit to follow the enclosing `Reveal`/`Stagger`. */
  step?: number;
  delay?: number;
  /** Seconds between characters. */
  stagger?: number;
  /** Paint the characters with the brand gradient, sliced so it stays continuous. */
  accent?: boolean;
  className?: string;
}

/**
 * Character-level entrance for a hero word: each letter rises out of a mask,
 * tipping forward from a slight `rotateX` as it lands. Keep it to one word per
 * slide — it is the loudest type move in the kit.
 *
 * @example <SplitReveal text="Eva" accent className="text-9xl font-semibold" />
 */
export function SplitReveal({
  text,
  step,
  delay = 0,
  stagger = STAGGER.char,
  accent = false,
  className,
}: SplitRevealProps) {
  const { on, delay: start } = useMotionCue(step, delay);
  const chars = [...text];

  return (
    <span
      aria-label={text}
      role="img"
      className={cn("inline-block whitespace-nowrap", className)}
      style={{ perspective: 600 }}
    >
      {chars.map((char, index) => {
        const at = start + index * stagger;
        const glyph = char === " " ? "\u00A0" : char;
        return (
          <span
            key={index}
            aria-hidden
            className="inline-block overflow-hidden px-[0.04em] -mx-[0.04em] py-[0.12em] -my-[0.12em] align-bottom"
          >
            <m.span
              className="inline-block origin-bottom"
              initial={{ y: "105%", rotateX: -40, opacity: 0 }}
              animate={
                on
                  ? { y: "0%", rotateX: 0, opacity: 1 }
                  : { y: "105%", rotateX: -40, opacity: 0 }
              }
              transition={cueTransition(on, at, {
                duration: DUR.hero,
                ease: EASE.expo,
                opacity: { duration: DUR.base, delay: at },
              })}
            >
              {accent ? (
                <AccentText
                  on={on}
                  delay={start + chars.length * stagger + 0.3}
                  slice={{ start: index, length: 1, total: chars.length }}
                >
                  {glyph}
                </AccentText>
              ) : (
                glyph
              )}
            </m.span>
          </span>
        );
      })}
    </span>
  );
}
