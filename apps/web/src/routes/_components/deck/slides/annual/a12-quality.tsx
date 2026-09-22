import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Stat {
  value: number;
  label: string;
  delay: number;
  accent?: boolean;
}

/** Left to right, biggest number first. */
const STATS: readonly Stat[] = [
  { value: 303, label: "tests", delay: 0.5, accent: true },
  { value: 79, label: "contract tests", delay: 0.65 },
  { value: 46, label: "test backfills", delay: 0.8 },
  { value: 4, label: "custom rules", delay: 0.95 },
];

const RULES = [
  "No unsafe types",
  "Parse at the edge",
  "No banned patterns",
  "Type check before shipping",
  "Release notes",
];

const NUMBER_CLASS = "text-7xl leading-none font-semibold tabular-nums";

export function AnnualQuality() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Quality</Kicker>
        <Title size="md">The bar is enforced, not remembered.</Title>
      </Reveal>

      <Stagger
        delayChildren={0.4}
        staggerChildren={0.15}
        className="mt-24 grid grid-cols-4 gap-6"
      >
        {STATS.map((stat) => (
          <StaggerItem key={stat.label}>
            <div className={NUMBER_CLASS}>
              {stat.accent ? (
                <Accent>
                  <CountUp
                    value={stat.value}
                    duration={1.6}
                    delay={stat.delay}
                  />
                </Accent>
              ) : (
                <span className="text-white">
                  <CountUp
                    value={stat.value}
                    duration={1.6}
                    delay={stat.delay}
                  />
                </span>
              )}
            </div>
            <div className="mt-4 text-base text-white/50">{stat.label}</div>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-24 flex gap-3">
        {RULES.map((rule, index) => (
          <m.div
            key={rule}
            className="rounded-full bg-white/[0.07] px-4 py-2 text-sm text-white/80"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={
              step >= 1
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 14, scale: 0.94 }
            }
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.55,
              delay: step >= 1 ? index * 0.08 : 0,
            }}
          >
            {rule}
          </m.div>
        ))}
      </div>

      <Reveal step={2} className="mt-20 text-center">
        <p className="text-3xl text-white/85">
          A permanently red test is <Accent>a broken test</Accent>.
        </p>
      </Reveal>

      <Footnote>Counts from the repository at 16 September 2026.</Footnote>
    </Shell>
  );
}
