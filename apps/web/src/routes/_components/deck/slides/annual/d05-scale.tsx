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
} from "../../_components/DeckPrimitives";

interface Figure {
  value: number;
  label: string;
  delay: number;
  accent?: boolean;
}

/** The five a non-engineer can weigh, biggest first. */
const HEADLINE: readonly Figure[] = [
  { value: 2936, label: "tracked files", delay: 0.45, accent: true },
  { value: 976, label: "backend functions", delay: 0.6 },
  { value: 363, label: "screens", delay: 0.75 },
  { value: 71, label: "data tables", delay: 0.9 },
  { value: 9854, label: "lines of release notes", delay: 1.05 },
];

/** The engineer's two, kept smaller so they do not compete. */
const SUPPORTING: readonly Figure[] = [
  { value: 2151, label: "TypeScript files", delay: 0.25 },
  { value: 18197, label: "lines in the shared library", delay: 0.4 },
];

export function AnnualScale() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Scale</Kicker>
        <Title size="md">How big it is now.</Title>
      </Reveal>

      <Stagger
        delayChildren={0.4}
        staggerChildren={0.14}
        className="mt-16 grid grid-cols-5 gap-6"
      >
        {HEADLINE.map((figure) => (
          <StaggerItem key={figure.label}>
            <div className="text-6xl leading-none font-semibold tabular-nums">
              {figure.accent ? (
                <Accent>
                  <CountUp value={figure.value} delay={figure.delay} />
                </Accent>
              ) : (
                <span className="text-white">
                  <CountUp value={figure.value} delay={figure.delay} />
                </span>
              )}
            </div>
            <div className="mt-4 text-base text-pretty text-white/50">
              {figure.label}
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} className="mt-16 flex gap-16">
        {SUPPORTING.map((figure) => (
          <div key={figure.label} className="flex items-baseline gap-3">
            <span className="text-3xl leading-none font-semibold tabular-nums text-white/75">
              <CountUp
                value={figure.value}
                step={1}
                delay={figure.delay}
                duration={1.3}
              />
            </span>
            <span className="text-base text-white/40">{figure.label}</span>
          </div>
        ))}
      </Reveal>

      <Reveal step={2} className="mt-14 text-center">
        <p className="text-3xl text-white/85">
          Eight months, one codebase, <Accent>one person directing</Accent>.
        </p>
      </Reveal>

      <Footnote>Measured 23 September 2026.</Footnote>
    </Shell>
  );
}
