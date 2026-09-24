import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  BRAND,
  Card,
  EASE_OUT,
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
  delay: number;
  accent?: boolean;
}

const HEADLINE: Stat[] = [
  { value: 4732, label: "changes shipped", delay: 0.6, accent: true },
  { value: 887, label: "pieces of work raised", delay: 0.75 },
  { value: 367, label: "working sessions", delay: 0.9 },
  { value: 1348, label: "release notes written", delay: 1.05 },
];

const SECONDARY: Stat[] = [
  { value: 16, label: "people with accounts", delay: 0 },
  { value: 19, label: "automations running", delay: 0.1 },
  { value: 504, label: "automation runs", delay: 0.2 },
  { value: 107, label: "documents written", delay: 0.3 },
];

const NUMBER_CLASS =
  "text-6xl leading-none font-semibold tracking-[-0.03em] tabular-nums";

export function AnnualNumbers() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>The year in numbers</Kicker>
        <Title size="md">What eight months produced.</Title>
      </Reveal>

      <m.div
        aria-hidden
        className="mt-7 h-px rounded-full"
        style={{
          background: `linear-gradient(to right, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ width: 0 }}
        animate={{ width: 160 }}
        transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.3 }}
      />

      <Stagger
        delayChildren={0.5}
        staggerChildren={0.15}
        className="mt-14 grid grid-cols-4 gap-6"
      >
        {HEADLINE.map((stat) => (
          <StaggerItem key={stat.label}>
            <div className={NUMBER_CLASS}>
              {stat.accent ? (
                <Accent>
                  <CountUp
                    value={stat.value}
                    duration={1.8}
                    delay={stat.delay}
                  />
                </Accent>
              ) : (
                <CountUp value={stat.value} duration={1.8} delay={stat.delay} />
              )}
            </div>
            <div className="mt-3 text-base text-white/50">{stat.label}</div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} className="mt-12">
        <Card>
          <Stagger
            step={1}
            delayChildren={0.2}
            staggerChildren={0.1}
            className="grid grid-cols-4 gap-6"
          >
            {SECONDARY.map((stat) => (
              <StaggerItem key={stat.label}>
                <div className="text-4xl leading-none font-semibold tracking-[-0.03em] tabular-nums">
                  <CountUp
                    value={stat.value}
                    step={1}
                    duration={1.8}
                    delay={0.2 + stat.delay}
                  />
                </div>
                <div className="mt-2 text-base text-white/50">{stat.label}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      </Reveal>

      <Reveal delay={2.2} className="mt-10">
        <p className="text-lg text-white/45">
          About 19 changes a day, every day, for eight months.
        </p>
      </Reveal>

      <Footnote>
        Eva&rsquo;s own records and project history, 11 January to 16 September
        2026.
      </Footnote>
    </Shell>
  );
}
