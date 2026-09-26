import type { Icon } from "@tabler/icons-react";
import {
  IconAccessible,
  IconBook,
  IconChartDots,
  IconRuler,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  MaskedText,
  STAGGER,
} from "../../_components/motion";
import { AnnCCountDown } from "../_parts/AnnCCountDown";

/** A brand wash behind each habit icon, faint enough to stay a tone. */
const HABIT_TINT =
  "linear-gradient(135deg, rgba(139,63,184,0.35), rgba(59,125,216,0.35))";

interface Result {
  label: string;
  before: number;
  /** The before figure as written in the source, so 64 does not read as 64.0. */
  beforeText: string;
  after: number;
  decimals: number;
  unit: string;
  reduction: string;
}

/** Medians of three runs, before and after the animation performance work. */
const RESULTS: readonly Result[] = [
  {
    label: "Loading shimmer",
    before: 32.6,
    beforeText: "32.6",
    after: 1.9,
    decimals: 1,
    unit: "ms/s",
    reduction: "−94%",
  },
  {
    label: "Shimmer repaints",
    before: 240,
    beforeText: "240",
    after: 0,
    decimals: 0,
    unit: "per second",
    reduction: "−100%",
  },
  {
    label: "Spinner recalculations",
    before: 420,
    beforeText: "420",
    after: 49,
    decimals: 0,
    unit: "per second",
    reduction: "−88%",
  },
  {
    label: "A real chat screen",
    before: 64,
    beforeText: "64",
    after: 45.5,
    decimals: 1,
    unit: "ms/s",
    reduction: "−29%",
  },
];

const HABITS: readonly { icon: Icon; label: string }[] = [
  { icon: IconChartDots, label: "Live traffic searchable" },
  { icon: IconBook, label: "Decisions written down" },
  { icon: IconRuler, label: "One design system" },
  { icon: IconAccessible, label: "Accessibility fixes" },
];

const TRACK_W = 446;
const BAR_DURATION = 1.3;
const HEAD_GLOW =
  "radial-gradient(circle, #fff 0 16%, rgba(59,125,216,0.5) 34%, transparent 70%)";

function ResultRow({
  result,
  index,
  settled,
}: {
  result: Result;
  index: number;
  settled: boolean;
}) {
  const delay = 0.45 + index * STAGGER.block;
  const share = result.after / result.before;
  const fall = { duration: BAR_DURATION, ease: EASE.expo, delay: delay + 0.2 };

  return (
    <m.div
      className="flex h-[60px] items-center gap-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: settled ? 0.65 : 1, y: 0 }}
      transition={
        settled
          ? { duration: DUR.slow, ease: EASE.out }
          : { duration: DUR.hero, ease: EASE.expo, delay }
      }
    >
      <div className="w-[260px] shrink-0 text-sm text-white/60">
        {result.label}
      </div>

      <div
        className="relative h-2.5 shrink-0"
        style={{ width: TRACK_W }}
        aria-hidden
      >
        <div className="absolute inset-0 rounded-full bg-white/20" />
        <m.div
          className="absolute inset-0 origin-left rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: share }}
          transition={fall}
        />
        {/* A lit edge rides the bar back to where the cost ended up. */}
        <m.span
          className="absolute top-1/2 left-0 -mt-3.5 -ml-3.5 size-7 rounded-full"
          style={{ background: HEAD_GLOW }}
          initial={{ x: TRACK_W, opacity: 0 }}
          animate={{ x: TRACK_W * share, opacity: [0, 1, 1, 0] }}
          transition={{
            x: fall,
            opacity: {
              duration: BAR_DURATION + 0.3,
              times: [0, 0.1, 0.7, 1],
              delay: delay + 0.2,
            },
          }}
        />
      </div>

      <div className="w-[190px] shrink-0 text-right text-sm tabular-nums text-white/45">
        {result.beforeText} →{" "}
        <AnnCCountDown
          from={result.before}
          to={result.after}
          decimals={result.decimals}
          fromText={result.beforeText}
          duration={BAR_DURATION}
          delay={delay + 0.2}
          className="text-white/90"
        />{" "}
        {result.unit}
      </div>

      <div className="w-[120px] shrink-0 text-right text-3xl font-semibold tabular-nums">
        <MaskedText delay={delay + BAR_DURATION * 0.55}>
          <Accent>{result.reduction}</Accent>
        </MaskedText>
      </div>
    </m.div>
  );
}

export function AnnualCraft() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Measurement</Kicker>
        <Title size="md">Measure it, do not guess.</Title>
      </Reveal>

      <div className="mt-10">
        {RESULTS.map((result, index) => (
          <ResultRow
            key={result.label}
            result={result}
            index={index}
            settled={step >= 1}
          />
        ))}
      </div>

      <Stagger
        step={1}
        delayChildren={0.1}
        staggerChildren={STAGGER.item}
        className="mt-10 flex gap-4"
      >
        {HABITS.map((habit) => (
          <StaggerItem key={habit.label} className="flex-1">
            <Card className="flex h-[52px] items-center gap-3 px-4 py-0">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                style={{ background: HABIT_TINT }}
              >
                <habit.icon
                  size={17}
                  stroke={1.6}
                  className="text-white/80"
                  aria-hidden
                />
              </span>
              <span className="text-sm text-white/85">{habit.label}</span>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-12 text-center">
        <MaskedText step={2} className="text-3xl text-white/85">
          Page scores: set up, <Accent>not yet a habit</Accent>.
        </MaskedText>
      </div>

      <Footnote>
        Animation performance work, 5 September 2026. Medians of three runs.
      </Footnote>
    </Shell>
  );
}
