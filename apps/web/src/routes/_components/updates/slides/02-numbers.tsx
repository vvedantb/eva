import { m } from "motion/react";
import { CountUp } from "../_components/CountUp";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../_components/DeckPrimitives";

interface Stat {
  value: number;
  label: string;
  delay: number;
  accent?: boolean;
}

const STATS: Stat[] = [
  { value: 2081, label: "changes shipped", delay: 0.6, accent: true },
  { value: 769, label: "release notes written", delay: 0.75 },
  { value: 260754, label: "lines of code added", delay: 0.9 },
  { value: 98, label: "bundles of work merged", delay: 1.05 },
];

// text-6xl rather than the 7xl the other decks use: 260,754 is seven glyphs and
// overflows its column at 72px.
const NUMBER_CLASS =
  "text-6xl leading-none font-semibold tracking-[-0.03em] tabular-nums";

export function Slide02Numbers() {
  return (
    <Shell>
      <Reveal>
        <Kicker>By the numbers</Kicker>
        <Title>Twelve weeks of shipping.</Title>
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
        className="mt-28 grid grid-cols-4 gap-6"
      >
        {STATS.map((stat) => (
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

      <Reveal delay={2.2}>
        <p className="mt-24 text-lg text-white/45">
          About 23 changes a day, every day, including weekends.
        </p>
      </Reveal>

      <Footnote>
        Source: Eva&rsquo;s git history, 12 June to 10 September 2026.
      </Footnote>
    </Shell>
  );
}
