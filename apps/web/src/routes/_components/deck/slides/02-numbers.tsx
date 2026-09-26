import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  CountRoll,
  DUR,
  EASE,
  GridBackdrop,
  MaskedText,
  Sheen,
} from "../_components/motion";

interface Stat {
  value: number;
  label: string;
  accent?: boolean;
}

const STATS: Stat[] = [
  { value: 2081, label: "changes shipped", accent: true },
  { value: 769, label: "release notes written" },
  { value: 260754, label: "lines of code added" },
  { value: 98, label: "bundles of work merged" },
];

/** The first column lands at this moment; the rest trail by `COLUMN_GAP`. */
const FIRST = 0.55;
const COLUMN_GAP = 0.14;
/** Close to the two seconds of counting the speaker notes promise. */
const ROLL = 1.7;

// text-6xl rather than the 7xl the other decks use: 260,754 is seven glyphs and
// overflows its column at 72px.
const NUMBER_CLASS =
  "text-6xl leading-none font-semibold tracking-[-0.03em] tabular-nums";

/** A ledger column: a rule draws, the figure rolls, the label rises. */
function StatColumn({ stat, index }: { stat: Stat; index: number }) {
  const at = FIRST + index * COLUMN_GAP;
  const figure = <CountRoll value={stat.value} duration={ROLL} delay={at} />;

  return (
    <div>
      <div className="relative mb-7 h-px bg-white/[0.08]">
        <m.span
          aria-hidden
          className="absolute inset-0 origin-left rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: stat.accent ? 1 : 0.45 }}
          transition={{
            duration: DUR.hero,
            ease: EASE.expo,
            delay: at - 0.15,
          }}
        />
      </div>
      <div className={NUMBER_CLASS}>
        {stat.accent ? (
          // Light crosses the lead figure once it has settled.
          <Sheen
            delay={at + ROLL - 0.2}
            className="-mx-3 -my-2 w-fit px-3 py-2"
          >
            <Accent>{figure}</Accent>
          </Sheen>
        ) : (
          figure
        )}
      </div>
      <MaskedText
        delay={at + 0.3}
        stagger={0.04}
        duration={DUR.slow}
        className="mt-3 block text-base text-white/50"
      >
        {stat.label}
      </MaskedText>
    </div>
  );
}

export function Slide02Numbers() {
  return (
    <Shell>
      <Reveal>
        <Kicker>Three months · The numbers</Kicker>
        <Title>Twelve weeks of shipping.</Title>
      </Reveal>

      <div className="relative isolate mt-24">
        <GridBackdrop
          variant="grid"
          cell={64}
          period={9}
          className="-inset-x-24 -top-16 -bottom-40"
        />
        <div className="grid grid-cols-4 gap-6">
          {STATS.map((stat, index) => (
            <StatColumn key={stat.label} stat={stat} index={index} />
          ))}
        </div>
      </div>

      <MaskedText
        delay={2.1}
        stagger={0.04}
        className="mt-24 block text-lg text-white/45"
      >
        About 23 changes a day, every day, including weekends.
      </MaskedText>

      <Footnote>
        Source: Eva&rsquo;s git history, 12 June to 10 September 2026.
      </Footnote>
    </Shell>
  );
}
