import { m } from "motion/react";
import { AnnCCountDown } from "../_parts/AnnCCountDown";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Drop {
  label: string;
  before: number;
  /** The before figure as written in the source, so 28 does not read as 28.0. */
  beforeText: string;
  after: number;
  decimals: number;
  unit: string;
}

/** One per build step, in the order they are spoken. */
const DROPS: readonly Drop[] = [
  {
    label: "Local build",
    before: 28,
    beforeText: "28",
    after: 2.6,
    decimals: 1,
    unit: "seconds",
  },
  {
    label: "Landing page, first download",
    before: 516,
    beforeText: "516",
    after: 362,
    decimals: 0,
    unit: "kB",
  },
  {
    label: "Code checker noise",
    before: 8862,
    beforeText: "8,862",
    after: 0,
    decimals: 0,
    unit: "warnings",
  },
];

const TRACK_W = 380;
const DURATION = 1.3;
const GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;

function DropRow({ drop, index }: { drop: Drop; index: number }) {
  const fallen = useDeckStep() >= index + 1;
  // A floor keeps a bar that falls to zero from vanishing entirely.
  const width = Math.max(TRACK_W * (drop.after / drop.before), 6);

  return (
    <m.div
      className="flex h-[104px] items-center gap-8"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        bounce: 0,
        duration: 0.55,
        delay: 0.3 + index * 0.12,
      }}
    >
      <div className="w-[270px] shrink-0 text-lg text-white/60">
        {drop.label}
      </div>

      <div
        className="relative h-3 shrink-0"
        style={{ width: TRACK_W }}
        aria-hidden
      >
        <div className="absolute inset-0 rounded-full bg-white/15" />
        <m.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: GRADIENT }}
          initial={false}
          animate={{ width: fallen ? width : TRACK_W }}
          transition={{
            duration: fallen ? DURATION : 0.4,
            ease: EASE_OUT,
            delay: fallen ? 0.15 : 0,
          }}
        />
      </div>

      <div className="flex flex-1 items-baseline justify-end gap-3">
        <span className="w-[76px] shrink-0 text-right text-base whitespace-nowrap tabular-nums text-white/35">
          {drop.beforeText} →
        </span>
        <span className="w-[140px] shrink-0 text-right text-5xl leading-none font-semibold tabular-nums">
          <Accent>
            <AnnCCountDown
              from={drop.before}
              to={drop.after}
              decimals={drop.decimals}
              fromText={drop.beforeText}
              step={index + 1}
              duration={DURATION}
              delay={0.15}
            />
          </Accent>
        </span>
        <span className="w-[86px] shrink-0 text-base text-white/45">
          {drop.unit}
        </span>
      </div>
    </m.div>
  );
}

export function AnnualFrontendPerf() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Front end</Kicker>
        <Title size="md">Making it quick to open.</Title>
      </Reveal>

      <div className="mt-16">
        {DROPS.map((drop, index) => (
          <DropRow key={drop.label} drop={drop} index={index} />
        ))}
      </div>

      <Footnote>
        Build and checker 20 August 2026; landing page 8 August 2026. A further
        1.7 MB came off the first load on 4 August 2026.
      </Footnote>
    </Shell>
  );
}
