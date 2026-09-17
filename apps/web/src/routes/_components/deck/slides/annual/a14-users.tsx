import { IconArrowRight } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Change {
  before: string;
  after: string;
}

/** Top to bottom, in the order they were decided. */
const CHANGES: Change[] = [
  { before: "Reviews, diffs, meters", after: "The conversation and a preview" },
  { before: "A list of twenty models", after: "One slider" },
  { before: "Called PRD", after: "Called Plan" },
  { before: "Written for engineers", after: "Written in plain language" },
];

const CHIPS = [
  "Usable on a phone",
  "Shortcuts made visible",
  "Dead-end pages removed",
];

/** The before phrases land first, then each is struck out in turn. */
const STRIKE_START = 0.7;
const STRIKE_GAP = 0.18;

function ChangeRow({ before, after, index }: Change & { index: number }) {
  const strike = STRIKE_START + index * STRIKE_GAP;

  return (
    <div className="flex items-center gap-7">
      <m.div
        className="w-[420px] shrink-0 text-2xl leading-snug text-white/45"
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: index * 0.1 }}
      >
        <span className="relative inline-block">
          {before}
          <m.span
            aria-hidden
            className="absolute top-1/2 left-0 h-[2px] w-full origin-left rounded-full bg-white/40"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.45, ease: EASE_OUT, delay: strike }}
          />
        </span>
      </m.div>

      <m.div
        className="flex items-center gap-4"
        initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{
          type: "spring",
          bounce: 0,
          duration: 0.6,
          delay: strike + 0.14,
        }}
      >
        <IconArrowRight size={20} className="text-[#3B7DD8]" aria-hidden />
        <span className="text-2xl leading-snug text-white/95">{after}</span>
      </m.div>
    </div>
  );
}

export function AnnualUsers() {
  const step = useDeckStep();
  const chipsIn = step >= 1;

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>The people using it</Kicker>
        <Title size="md">Built for who is actually looking at it.</Title>
      </Reveal>

      <div className="mt-12 flex flex-col gap-8">
        {CHANGES.map((change, index) => (
          <ChangeRow
            key={change.before}
            before={change.before}
            after={change.after}
            index={index}
          />
        ))}
      </div>

      <div className="mt-12 flex gap-3">
        {CHIPS.map((chip, index) => (
          <m.div
            key={chip}
            initial={false}
            animate={
              chipsIn
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 14, scale: 0.96 }
            }
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.5,
              delay: chipsIn ? index * 0.09 : 0,
            }}
            className="rounded-full bg-white/[0.07] px-5 py-2.5 text-sm text-white/80"
          >
            {chip}
          </m.div>
        ))}
      </div>

      <Reveal step={2} className="mt-10">
        <p className="text-center text-3xl font-medium text-white/90">
          Not cleverer. <Accent>Usable.</Accent>
        </p>
      </Reveal>

      <Footnote>
        Simple Mode from 14 August 2026; mobile audits August and September
        2026.
      </Footnote>
    </Shell>
  );
}
