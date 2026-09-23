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

interface Shelved {
  plan: string;
  /** Absent where the written plan records no closing date. */
  date?: string;
  /** The verdict the plan was closed with, stamped over it. */
  verdict: string;
}

/** One per build step, in the order they were closed. */
const PLANS: readonly Shelved[] = [
  { plan: "Move the workers", verdict: "Not needed" },
  {
    plan: "Adopt a new framework",
    date: "17 July 2026",
    verdict: "Do not adopt",
  },
  {
    plan: "Unify design sessions",
    date: "29 July 2026",
    verdict: "Reversed twice",
  },
];

/** Appear crisp, hold, then settle onto the shelf. */
const SETTLE = { duration: 2.4, times: [0, 0.22, 0.55, 1], ease: EASE_OUT };
const HIDDEN = { opacity: 0, y: 20, rotate: 0, scale: 0.96 };

function ShelvedCard({ item, index }: { item: Shelved; index: number }) {
  const shown = useDeckStep() >= index;

  return (
    <m.div
      className="relative flex h-[250px] flex-1 flex-col justify-between rounded-2xl bg-white/[0.06] p-7"
      initial={HIDDEN}
      animate={
        shown
          ? {
              opacity: [0, 1, 1, 0.45],
              y: [20, 0, 0, 0],
              rotate: [0, 0, 0, -1.8],
              scale: [0.96, 1, 1, 0.975],
            }
          : HIDDEN
      }
      transition={shown ? SETTLE : { duration: 0.3, ease: EASE_OUT }}
    >
      <div>
        {/* Inline-block so the rule is the width of the words, not the card. */}
        <p className="relative inline-block text-2xl leading-snug font-medium text-balance text-white">
          {item.plan}
          <m.span
            aria-hidden
            className="absolute top-1/2 -left-1 block h-px w-[calc(100%+8px)] origin-left bg-white/55"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: shown ? 1 : 0 }}
            transition={{
              duration: shown ? 0.5 : 0.2,
              ease: EASE_OUT,
              delay: shown ? 1.3 : 0,
            }}
          />
        </p>
      </div>

      <div>
        <m.span
          className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/70"
          initial={{ opacity: 0, y: 8, rotate: 0 }}
          animate={{
            opacity: shown ? 1 : 0,
            y: shown ? 0 : 8,
            rotate: shown ? -2 : 0,
          }}
          transition={{
            type: "spring",
            bounce: 0.3,
            duration: 0.55,
            delay: shown ? 1.45 : 0,
          }}
        >
          {item.verdict}
        </m.span>
        <div className="mt-4 h-4 text-xs tracking-[0.18em] text-white/30 uppercase">
          {item.date ?? ""}
        </div>
      </div>
    </m.div>
  );
}

export function AnnualAbandoned() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Decisions</Kicker>
        <Title size="md">Things we stopped.</Title>
      </Reveal>

      <div className="mt-10 flex gap-6">
        {PLANS.map((item, index) => (
          <ShelvedCard key={item.plan} item={item} index={index} />
        ))}
      </div>

      <Reveal step={3} className="mt-10 text-center">
        <p className="text-3xl text-white/85">
          Written down, so nobody <Accent>re-argues it from memory</Accent>.
        </p>
      </Reveal>

      <Footnote>Seven cancelled plans kept in the repository.</Footnote>
    </Shell>
  );
}
