import { m } from "motion/react";
import { cn } from "@eva/ui";
import { Accent, EASE_OUT, useDeckStep } from "./DeckPrimitives";

interface BlurWordsTitleProps {
  lines: string[];
  size?: "lg" | "xl" | "2xl";
  step?: number;
  delay?: number;
  className?: string;
}

const SIZES: Record<"lg" | "xl" | "2xl", string> = {
  lg: "text-6xl",
  xl: "text-7xl",
  "2xl": "text-8xl",
};

const WORD_STAGGER = 0.12;

/** True for `Eva`, `Eva,`, `Eva.` and friends — the brand word gets the gradient. */
function isBrandWord(word: string): boolean {
  return /^Eva[.,;:!?]?$/.test(word);
}

/**
 * A headline that resolves word by word out of a blur. Used for the opening and
 * closing slides, where the title is the whole slide.
 */
export function BlurWordsTitle({
  lines,
  size = "xl",
  step = 0,
  delay = 0,
  className,
}: BlurWordsTitleProps) {
  const visible = useDeckStep() >= step;
  // Flatten first so every word carries its own stagger index across all lines.
  const rows = lines.map((line, index) => ({
    line,
    words: line.split(" "),
    offset: lines
      .slice(0, index)
      .reduce((total, earlier) => total + earlier.split(" ").length, 0),
  }));

  return (
    <h1
      className={cn(
        "font-semibold tracking-[-0.025em] text-white",
        "leading-[1.02]",
        SIZES[size],
        className,
      )}
    >
      {rows.map(({ line, words, offset }) => (
        <span key={line} className="block">
          {words.map((word, index) => {
            const at = offset + index;
            return (
              <m.span
                key={`${line}-${at}`}
                className="inline-block"
                style={{ marginRight: "0.24em" }}
                initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                animate={
                  visible
                    ? { opacity: 1, y: 0, filter: "blur(0px)" }
                    : { opacity: 0, y: 10, filter: "blur(10px)" }
                }
                transition={{
                  duration: 0.6,
                  ease: EASE_OUT,
                  delay: visible ? delay + at * WORD_STAGGER : 0,
                }}
              >
                {isBrandWord(word) ? <Accent>{word}</Accent> : word}
              </m.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
