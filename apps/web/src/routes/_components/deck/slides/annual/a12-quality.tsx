import { CountUp } from "../../_components/CountUp";
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

interface Stat {
  value: number;
  label: string;
  note: string;
}

/** Left to right, biggest number first. */
const STATS: Stat[] = [
  {
    value: 303,
    label: "automated tests",
    note: "Across the app, the backend and the shared components",
  },
  {
    value: 79,
    label: "contract tests",
    note: "They fail if two parts of the system drift apart",
  },
  {
    value: 46,
    label: "test backfills",
    note: "A nightly routine writes tests for past fixes",
  },
  {
    value: 4,
    label: "custom code rules",
    note: "Written by hand where off-the-shelf rules could not express the standard",
  },
];

const RULES = [
  "No unsafe type escapes",
  "Parse untrusted data at the edge",
  "No banned React patterns",
  "Type check and lint before shipping",
  "Release notes for anything substantial",
];

export function AnnualQuality() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Quality</Kicker>
        <Title size="md">The bar is enforced, not remembered.</Title>
        <Body className="mt-4 max-w-5xl text-base">
          Standards live in the repository and run automatically, so they hold
          whether a person or an agent is writing the code.
        </Body>
      </Reveal>

      <Stagger
        delayChildren={0.3}
        staggerChildren={0.1}
        className="mt-8 flex gap-5"
      >
        {STATS.map((stat) => (
          <StaggerItem key={stat.label}>
            <Card className="flex h-[160px] w-[250px] flex-col p-5">
              <CountUp
                value={stat.value}
                delay={0.3}
                className="text-5xl font-semibold tabular-nums text-white"
              />
              <div className="mt-2 text-base leading-snug text-white/80">
                {stat.label}
              </div>
              <div className="mt-2 text-xs leading-snug text-white/45">
                {stat.note}
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} className="mt-6">
        <Card className="w-[1060px] p-5">
          <div className="text-base font-semibold text-white">
            Written rules, applied to every change
          </div>
          <Stagger
            step={1}
            delayChildren={0.2}
            staggerChildren={0.07}
            className="mt-3 flex flex-wrap gap-2"
          >
            {RULES.map((rule) => (
              <StaggerItem
                key={rule}
                className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-white/80"
              >
                {rule}
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      </Reveal>

      <Reveal step={2} className="mt-6">
        <p className="w-[1060px] text-base leading-relaxed text-white/60">
          When a test goes permanently red it is treated as a defect in the
          test, because a suite people stop reading protects nothing.
        </p>
      </Reveal>

      <Footnote>Counts from the repository at 16 September 2026.</Footnote>
    </Shell>
  );
}
