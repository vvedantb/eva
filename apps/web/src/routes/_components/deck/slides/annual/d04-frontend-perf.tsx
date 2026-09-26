import { m } from "motion/react";
import { AnnCCountDown } from "../_parts/AnnCCountDown";
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
  BRAND_GRADIENT,
  DUR,
  EASE,
  STAGGER,
  Sheen,
  Spotlight,
  cueTransition,
} from "../../_components/motion";

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
const ROW_H = 104;
const BLEED = 260;
const HEAD_GLOW =
  "radial-gradient(circle, #fff 0 16%, rgba(59,125,216,0.5) 34%, transparent 70%)";
/** The light sits behind whichever figure is falling. */
const LIGHT = [
  null,
  ...DROPS.map((_, index) => ({
    x: BLEED + 930,
    y: BLEED + index * ROW_H + ROW_H / 2,
    size: 340,
  })),
];

function DropRow({ drop, index }: { drop: Drop; index: number }) {
  const step = useDeckStep();
  const fallen = step >= index + 1;
  const current = step === index + 1;
  // At rest every row is lit; once the build starts, the falling row leads.
  const opacity = step === 0 || current ? 1 : fallen ? 0.7 : 0.45;
  // A floor keeps a bar that falls to zero from vanishing entirely.
  const share = Math.max(drop.after / drop.before, 6 / TRACK_W);
  const fall = fallen
    ? { duration: DURATION, ease: EASE.expo, delay: 0.15 }
    : { duration: DUR.base, ease: EASE.out };

  return (
    <m.div
      className="flex items-center gap-8"
      style={{ height: ROW_H }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity, y: 0 }}
      transition={
        step === 0
          ? {
              duration: DUR.hero,
              ease: EASE.expo,
              delay: 0.3 + index * STAGGER.block,
            }
          : { duration: DUR.slow, ease: EASE.out }
      }
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
          className="absolute inset-0 origin-left rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={false}
          animate={{ scaleX: fallen ? share : 1 }}
          transition={fall}
        />
        <m.span
          className="absolute top-1/2 left-0 -mt-4 -ml-4 size-8 rounded-full"
          style={{ background: HEAD_GLOW }}
          initial={false}
          animate={{
            x: fallen ? TRACK_W * share : TRACK_W,
            opacity: current ? [0, 1, 1, 0] : 0,
          }}
          transition={{
            x: fall,
            opacity: current
              ? {
                  duration: DURATION + 0.3,
                  times: [0, 0.1, 0.7, 1],
                  delay: 0.15,
                }
              : { duration: DUR.fast },
          }}
        />
      </div>

      <div className="flex flex-1 items-baseline justify-end gap-3">
        <span className="w-[76px] shrink-0 text-right text-base whitespace-nowrap tabular-nums text-white/35">
          <span className="relative">
            {drop.beforeText}
            {/* The old figure is struck through once the new one has landed. */}
            <m.span
              aria-hidden
              className="absolute inset-x-[-3px] top-1/2 h-px origin-left bg-white/45"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: fallen ? 1 : 0 }}
              transition={cueTransition(fallen, 0.15 + DURATION * 0.8, {
                duration: DUR.slow,
                ease: EASE.inOut,
              })}
            />
          </span>{" "}
          →
        </span>
        <Sheen
          step={index + 1}
          delay={0.15 + DURATION}
          className="-my-2 w-[140px] shrink-0 rounded-lg py-2 text-right"
        >
          <span className="text-5xl leading-none font-semibold tabular-nums">
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
        </Sheen>
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
        <Kicker>Craft · Speed</Kicker>
        <Title size="md">Three waits, measured and cut.</Title>
      </Reveal>

      <div className="relative isolate mt-16">
        <div
          className="pointer-events-none absolute isolate -z-10"
          style={{ inset: -BLEED }}
        >
          <Spotlight shots={LIGHT} />
        </div>
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
