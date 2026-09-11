import { use } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { SlideStepContext } from "./SlideShell";

const EVA_WORD = /^(eva)([.,!?:;'"]*)$/i;

function renderWord(word: string): ReactNode {
  const match = EVA_WORD.exec(word);
  if (!match) return word;
  const [, eva, trailing] = match;
  return (
    <>
      <span className="font-semibold">{eva}</span>
      {trailing}
    </>
  );
}

const wordVariants: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

interface BlurWordsTitleProps {
  lines: string[];
  size?: "xl" | "2xl" | "3xl" | "4xl";
  step?: number;
  delay?: number;
}

export function BlurWordsTitle({
  lines,
  size = "2xl",
  step = 0,
  delay = 0,
}: BlurWordsTitleProps) {
  const contextStep = use(SlideStepContext);
  const isVisible = contextStep >= step;

  const sizeClass =
    size === "xl"
      ? "text-5xl"
      : size === "2xl"
        ? "text-6xl"
        : size === "3xl"
          ? "text-7xl"
          : "text-8xl";

  const containerVariants: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.2,
        delayChildren: delay,
      },
    },
  };

  return (
    <motion.h1
      className={`font-sans ${sizeClass} font-semibold leading-tight tracking-tight text-foreground`}
      variants={containerVariants}
      initial="hidden"
      animate={isVisible ? "show" : "hidden"}
    >
      {lines.flatMap((line, lineIdx) => {
        const words = line.split(" ").filter(Boolean);
        const wordSpans = words.map((word, wordIdx) => (
          <motion.span
            key={`${lineIdx}-${wordIdx}`}
            variants={wordVariants}
            className="inline-block"
            style={{ marginRight: "0.22em" }}
          >
            {renderWord(word)}
          </motion.span>
        ));
        if (lineIdx < lines.length - 1) {
          return [...wordSpans, <br key={`br-${lineIdx}`} />];
        }
        return wordSpans;
      })}
    </motion.h1>
  );
}
