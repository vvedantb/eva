import type { Icon } from "@tabler/icons-react";
import {
  IconAccessible,
  IconBook,
  IconChartDots,
  IconCheck,
  IconRuler,
} from "@tabler/icons-react";
import {
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";

interface Result {
  label: string;
  change: string;
  reduction: string;
}

/** Medians of three runs, before and after the animation performance work. */
const RESULTS: readonly Result[] = [
  {
    label: "Loading shimmer · main thread",
    change: "32.6 → 1.9 ms/s",
    reduction: "−94%",
  },
  {
    label: "Loading shimmer · repaints",
    change: "240 → 0 per second",
    reduction: "−100%",
  },
  {
    label: "Spinner · style recalculations",
    change: "420 → 49 per second",
    reduction: "−88%",
  },
  {
    label: "A realistic chat screen",
    change: "64 → 45.5 ms/s",
    reduction: "−29%",
  },
];

/** The method, stated so the numbers can be challenged. */
const METHOD = [
  "A fresh browser tab for every run",
  "Three runs, compared on the middle one",
  "Pictures compared frame by frame to prove nothing changed visually",
  "The rig's own blind spot written down: no graphics card in the test machine",
];

interface Habit {
  icon: Icon;
  heading: string;
  line: string;
}

/** The other habits picked up alongside the measurement rig. */
const HABITS: readonly Habit[] = [
  {
    icon: IconChartDots,
    heading: "Live traffic searchable",
    line: "Errors and slow paths queried directly",
  },
  {
    icon: IconBook,
    heading: "Written docs",
    line: "Design, data and security conventions, in the repo",
  },
  {
    icon: IconRuler,
    heading: "One design system",
    line: "Shared surface, shadow and motion rules",
  },
  {
    icon: IconAccessible,
    heading: "Accessibility fixes",
    line: "Zoom restored, touch targets, screen-reader names",
  },
];

export function AnnualCraft() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Beyond code</Kicker>
        <Title size="md">Measure it, do not guess.</Title>
        <Body className="mt-3 max-w-4xl text-lg">
          This year&apos;s skill outside programming was measurement: a rig that
          records what the browser actually does, run three times per change and
          compared on medians.
        </Body>
      </Reveal>

      <div className="mt-6 flex items-stretch gap-7">
        <Stagger
          delayChildren={0.2}
          staggerChildren={0.1}
          className="flex w-[560px] flex-col gap-2.5"
        >
          {RESULTS.map((result) => (
            <StaggerItem key={result.label}>
              <Card className="flex h-[64px] items-center justify-between px-4 py-0">
                <div>
                  <div className="text-[13px] leading-none text-white/55">
                    {result.label}
                  </div>
                  <div className="mt-1.5 text-lg leading-none tabular-nums text-white/90">
                    {result.change}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-3 py-1 text-sm font-medium tabular-nums text-white">
                  {result.reduction}
                </span>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.3} from="right" className="w-[460px]">
          <Card className="flex h-full flex-col p-5">
            <div className="text-sm font-medium text-white/85">
              How it was measured
            </div>
            <div className="mt-4 flex flex-1 flex-col justify-between py-1">
              {METHOD.map((line) => (
                <div key={line} className="flex items-start gap-2.5">
                  <IconCheck
                    size={15}
                    className="mt-0.5 shrink-0 text-white/40"
                    aria-hidden
                  />
                  <span className="text-[13px] leading-snug text-white/70">
                    {line}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>

      <Stagger step={1} staggerChildren={0.08} className="mt-5 flex gap-4">
        {HABITS.map((habit) => (
          <StaggerItem key={habit.heading}>
            <Card className="h-[84px] w-[257px] px-4 py-3">
              <habit.icon
                size={18}
                stroke={1.6}
                className="text-white/55"
                aria-hidden
              />
              <div className="mt-1.5 text-[13px] leading-none font-medium text-white/90">
                {habit.heading}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-white/50">
                {habit.line}
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={2} className="mt-4">
        <p className="max-w-4xl text-base leading-snug text-white/55">
          The page-score tools are set up but not yet part of the routine. That
          is the next thing to make a habit.
        </p>
      </Reveal>

      <Footnote>
        Animation performance work, 5 September 2026. Figures are medians of
        three runs.
      </Footnote>
    </Shell>
  );
}
