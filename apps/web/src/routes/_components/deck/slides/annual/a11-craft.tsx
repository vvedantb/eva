import type { Icon } from "@tabler/icons-react";
import {
  IconAccessible,
  IconBook,
  IconChartDots,
  IconRuler,
} from "@tabler/icons-react";
import { animate, m } from "motion/react";
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
  { icon: IconBook, label: "Written docs" },
  { icon: IconRuler, label: "One design system" },
  { icon: IconAccessible, label: "Accessibility fixes" },
];

const TRACK_W = 446;
const BAR_DURATION = 1.2;

/** Counts a figure down from `before` to `after`, in step with its bar. */
function CountDown({
  before,
  after,
  decimals,
  delay,
}: {
  before: number;
  after: number;
  decimals: number;
  delay: number;
}) {
  return (
    <span
      className="tabular-nums text-white/90"
      // `started` guards the one-shot count: React re-attaches an inline ref on
      // every render, and a step press must not rewind the figure.
      ref={(el) => {
        if (!el || el.dataset.started === "true") return;
        el.dataset.started = "true";
        animate(before, after, {
          duration: BAR_DURATION,
          delay,
          ease: EASE_OUT,
          onUpdate: (v) => {
            el.textContent = v.toFixed(decimals);
          },
        });
      }}
    >
      {before.toFixed(decimals)}
    </span>
  );
}

function ResultRow({ result, index }: { result: Result; index: number }) {
  const delay = 0.35 + index * 0.15;
  const width = TRACK_W * (result.after / result.before);

  return (
    <m.div
      className="flex h-[60px] items-center gap-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.5, delay }}
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
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ width: TRACK_W }}
          animate={{ width }}
          transition={{ duration: BAR_DURATION, delay, ease: EASE_OUT }}
        />
      </div>

      <div className="w-[190px] shrink-0 text-right text-sm tabular-nums text-white/45">
        {result.beforeText} →{" "}
        <CountDown
          before={result.before}
          after={result.after}
          decimals={result.decimals}
          delay={delay}
        />{" "}
        {result.unit}
      </div>

      <div className="w-[120px] shrink-0 text-right text-3xl font-semibold tabular-nums">
        <Accent>{result.reduction}</Accent>
      </div>
    </m.div>
  );
}

export function AnnualCraft() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Beyond code</Kicker>
        <Title size="md">Measure it, do not guess.</Title>
      </Reveal>

      <div className="mt-10">
        {RESULTS.map((result, index) => (
          <ResultRow key={result.label} result={result} index={index} />
        ))}
      </div>

      <div className="mt-10 flex gap-4">
        {HABITS.map((habit, index) => (
          <m.div
            key={habit.label}
            className="flex h-[52px] flex-1 items-center gap-3 rounded-2xl bg-white/[0.05] px-4"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={
              step >= 1
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 16, scale: 0.96 }
            }
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.55,
              delay: step >= 1 ? index * 0.09 : 0,
            }}
          >
            <habit.icon
              size={20}
              stroke={1.6}
              className="shrink-0 text-white/55"
              aria-hidden
            />
            <span className="text-sm text-white/85">{habit.label}</span>
          </m.div>
        ))}
      </div>

      <Reveal step={2} className="mt-12 text-center">
        <p className="text-3xl text-white/85">
          Page scores: set up, <Accent>not yet a habit</Accent>.
        </p>
      </Reveal>

      <Footnote>
        Animation performance work, 5 September 2026. Medians of three runs.
      </Footnote>
    </Shell>
  );
}
