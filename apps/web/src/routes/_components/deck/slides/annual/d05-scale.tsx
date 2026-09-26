import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import {
  CountRoll,
  DUR,
  DrawPath,
  EASE,
  GridBackdrop,
  MaskedText,
} from "../../_components/motion";

interface Figure {
  value: number;
  label: string;
  delay: number;
  accent?: boolean;
}

/** The five a non-engineer can weigh, biggest first. */
const HEADLINE: readonly Figure[] = [
  { value: 2936, label: "tracked files", delay: 0.45, accent: true },
  { value: 976, label: "backend functions", delay: 0.58 },
  { value: 363, label: "screens", delay: 0.7 },
  { value: 71, label: "data tables", delay: 0.82 },
  { value: 9854, label: "lines of release notes", delay: 0.94 },
];

/** The engineer's two, kept smaller so they do not compete. */
const SUPPORTING: readonly Figure[] = [
  { value: 2151, label: "TypeScript files", delay: 0.45 },
  { value: 18197, label: "lines in the shared library", delay: 0.6 },
];

/** Content width inside the Shell gutters. */
const WIDTH = 1088;
/** Brackets everything above into one: the "one codebase" beat. */
const BRACKET = `M1 1 V13 H${WIDTH - 1} V1`;

function Rule({ accent, delay }: { accent?: boolean; delay: number }) {
  return (
    <m.div
      aria-hidden
      className="mb-5 h-px w-full origin-left"
      style={{
        background: accent
          ? `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue} 60%, transparent)`
          : "linear-gradient(90deg, rgba(255,255,255,0.22), transparent)",
      }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: DUR.hero, ease: EASE.expo, delay }}
    />
  );
}

export function AnnualScale() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Craft · Scale</Kicker>
        <Title size="md">A product now, not a prototype.</Title>
      </Reveal>

      <div className="relative isolate mt-16 grid grid-cols-5 gap-6 py-2">
        <GridBackdrop
          cell={48}
          period={8}
          className="-inset-x-24 -inset-y-10"
        />
        {HEADLINE.map((figure) => (
          <div key={figure.label}>
            <Rule accent={figure.accent} delay={figure.delay - 0.2} />
            <div className="text-6xl leading-none font-semibold tabular-nums">
              {figure.accent ? (
                <Accent>
                  <CountRoll value={figure.value} delay={figure.delay} />
                </Accent>
              ) : (
                <span className="text-white">
                  <CountRoll value={figure.value} delay={figure.delay} />
                </span>
              )}
            </div>
            <m.div
              className="mt-4 text-base text-pretty text-white/50"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: DUR.slow,
                ease: EASE.out,
                delay: figure.delay + 0.35,
              }}
            >
              {figure.label}
            </m.div>
          </div>
        ))}
      </div>

      {/* The engineer's two roll in on the far side of a dividing line. */}
      <DrawPath
        d={`M0 1 L${WIDTH} 1`}
        width={WIDTH}
        height={2}
        step={1}
        duration={0.9}
        strokeWidth={1}
        color="rgba(255,255,255,0.14)"
        className="mt-12"
      />
      <div className="mt-8 flex gap-16">
        {SUPPORTING.map((figure) => (
          <div key={figure.label} className="flex items-baseline gap-3">
            <span className="text-3xl leading-none font-semibold tabular-nums text-white/75">
              <CountRoll
                value={figure.value}
                step={1}
                delay={figure.delay}
                duration={1.3}
              />
            </span>
            <Reveal step={1} delay={figure.delay + 0.3} distance={8}>
              <span className="text-base text-white/40">{figure.label}</span>
            </Reveal>
          </div>
        ))}
      </div>

      <DrawPath
        d={BRACKET}
        width={WIDTH}
        height={14}
        step={2}
        duration={1.1}
        strokeWidth={1.5}
        dot
        className="mt-12"
      />
      <p className="mt-7 text-center text-3xl text-white/85">
        <MaskedText step={2} delay={0.55}>
          Eight months, one codebase, <Accent>one person directing</Accent>.
        </MaskedText>
      </p>

      <Footnote>Measured 23 September 2026.</Footnote>
    </Shell>
  );
}
