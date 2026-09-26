import { IconFileText } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  Spotlight,
} from "../../_components/motion";
import type { SpotlightShot } from "../../_components/motion";

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

/** Content width inside the Shell gutters, and the card row below the title. */
const WIDTH = 1088;
const CARD_HEIGHT = 250;
const COLUMN = (WIDTH - 2 * 24) / 3;

/** The glow's box overhangs the row by this much, so its falloff is never clipped. */
const SPOT_BLEED = 128;
/** Glow behind the plan being closed on each step; off for the closing line. */
const SPOT_SHOTS: readonly (SpotlightShot | null)[] = [
  ...PLANS.map((_, column) => ({
    x: SPOT_BLEED + COLUMN / 2 + column * (COLUMN + 24),
    y: SPOT_BLEED + CARD_HEIGHT / 2,
    size: 440,
  })),
  null,
];

/** The beats inside one card, in seconds from its step. */
const LAND = 0.5;
const STRIKE = 0.6;
const STAMP = 1.15;
const SHELVE = 1.65;
const TOTAL = 2.7;

/** Lands crisp, takes the stamp with a small thud, then settles onto the shelf. */
const CARD_BEATS = {
  duration: TOTAL,
  times: [
    0,
    LAND / TOTAL,
    STAMP / TOTAL,
    (STAMP + 0.1) / TOTAL,
    SHELVE / TOTAL,
    1,
  ],
  ease: EASE.out,
};
const HIDDEN = { opacity: 0, y: 24, rotate: 0, scale: 0.96 };

/** Faint lines of the written plan under its heading. */
const BODY_LINES = ["92%", "80%", "64%"];

function ShelvedCard({ item, index }: { item: Shelved; index: number }) {
  const shown = useDeckStep() >= index;

  return (
    <m.div
      className="relative isolate flex flex-1 flex-col overflow-hidden rounded-2xl bg-white/[0.06] p-7"
      style={{ height: CARD_HEIGHT }}
      initial={HIDDEN}
      animate={
        shown
          ? {
              opacity: [0, 1, 1, 1, 1, 0.5],
              y: [24, 0, 0, 3, 0, 6],
              rotate: [0, 0, 0, 0, 0, -1.6],
              scale: [0.96, 1, 1, 0.99, 1, 0.975],
            }
          : HIDDEN
      }
      transition={shown ? CARD_BEATS : { duration: DUR.fast, ease: EASE.out }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-2/5 bg-gradient-to-b from-white/[0.05] to-transparent"
      />
      <IconFileText
        size={20}
        stroke={1.6}
        className="mb-4 text-white/35"
        aria-hidden
      />
      {/* Inline-block so the rule is the width of the words, not the card. */}
      <p className="relative inline-block self-start text-2xl leading-snug font-medium text-balance text-white">
        {item.plan}
        <m.span
          aria-hidden
          className="absolute top-1/2 -left-1 block h-[2px] w-[calc(100%+8px)] origin-left rounded-full bg-white/60"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: shown ? 1 : 0 }}
          transition={
            shown
              ? { duration: 0.5, ease: EASE.inOut, delay: STRIKE }
              : { duration: DUR.fast }
          }
        />
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {BODY_LINES.map((width, line) => (
          <m.span
            key={width}
            aria-hidden
            className="block h-1.5 origin-left rounded-full bg-white/[0.07]"
            style={{ width }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: shown ? 1 : 0 }}
            transition={
              shown
                ? {
                    duration: DUR.slow,
                    ease: EASE.expo,
                    delay: 0.2 + line * 0.06,
                  }
                : { duration: DUR.fast }
            }
          />
        ))}
      </div>

      <div className="mt-auto flex items-end justify-between">
        <div className="h-4 text-xs tracking-[0.18em] text-white/30 uppercase">
          {item.date ?? ""}
        </div>
        {/* The stamp: comes down from above the page and lands hard. */}
        <m.span
          className="inline-block rounded-lg px-3.5 py-1.5 text-sm font-medium text-white/75 ring-1 ring-white/30"
          initial={{ opacity: 0, scale: 1.6, rotate: -9 }}
          animate={
            shown
              ? { opacity: 1, scale: 1, rotate: -4 }
              : { opacity: 0, scale: 1.6, rotate: -9 }
          }
          transition={
            shown
              ? {
                  duration: 0.32,
                  ease: EASE.in,
                  delay: STAMP - 0.32,
                  opacity: { duration: 0.12, delay: STAMP - 0.32 },
                }
              : { duration: DUR.fast }
          }
        >
          {item.verdict}
        </m.span>
      </div>
    </m.div>
  );
}

export function AnnualAbandoned() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Decisions</Kicker>
        <Title size="md">Knowing what to stop.</Title>
      </Reveal>

      <div className="relative isolate mt-10">
        {/* Follows the plan being closed; goes out for the closing line. */}
        <Spotlight shots={SPOT_SHOTS} className="-inset-32" />
        <div className="flex gap-6">
          {PLANS.map((item, index) => (
            <ShelvedCard key={item.plan} item={item} index={index} />
          ))}
        </div>
        {/* The shelf the closed plans come to rest on. */}
        <DrawPath
          d={`M0 1 L${WIDTH} 1`}
          width={WIDTH}
          height={2}
          duration={1.2}
          delay={0.3}
          strokeWidth={1}
          color="rgba(255,255,255,0.16)"
          className="mt-5"
        />
      </div>

      <p className="mt-10 text-center text-3xl text-white/85">
        <MaskedText step={3} delay={0.1}>
          Written down, so nobody <Accent>re-argues it from memory</Accent>.
        </MaskedText>
      </p>

      <Footnote>Seven cancelled plans kept in the repository.</Footnote>
    </Shell>
  );
}
