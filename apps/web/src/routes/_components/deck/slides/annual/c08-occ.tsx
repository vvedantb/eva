import type { ReactNode } from "react";
import { m } from "motion/react";
import {
  Accent,
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, Sheen, cueTransition } from "../../_components/motion";
import { AnnBCountDown } from "../_parts/AnnBCountDown";
import { MoA3CollisionCause, MoA3CollisionChart } from "../_parts/MoA3OccBeats";

/** Each beat owns the stage in turn, so only one idea is ever on screen. */
function Beat({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <m.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={
        active
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: -12, scale: 0.98 }
      }
      transition={
        active
          ? { duration: DUR.hero, ease: EASE.expo, delay: 0.15 }
          : { duration: DUR.base, ease: EASE.in }
      }
    >
      {children}
    </m.div>
  );
}

interface Fix {
  label: string;
  before: string;
  from: number;
  to: number;
  unit: string;
}

const FIXES: readonly Fix[] = [
  {
    label: "Lease renewals",
    before: "6.7 a second",
    from: 6.7,
    to: 1,
    unit: "a minute",
  },
  {
    label: "Live cursors",
    before: "20 a second",
    from: 20,
    to: 6.7,
    unit: "a second",
  },
];

function FixFigures() {
  const on = useDeckStep() >= 3;
  return (
    <div className="flex h-full items-center justify-center gap-44">
      {FIXES.map((fix, index) => (
        <div key={fix.label} className="flex flex-col items-center">
          <div className="text-sm text-white/45">{fix.label}</div>
          <div className="relative mt-2 text-lg tabular-nums text-white/35">
            {fix.before}
            {/* The old rate is struck through as the new one lands. */}
            <m.span
              aria-hidden
              className="absolute inset-x-[-4px] top-1/2 h-px origin-left bg-white/45"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: on ? 1 : 0 }}
              transition={cueTransition(on, 1.5 + index * 0.12, {
                duration: DUR.slow,
                ease: EASE.inOut,
              })}
            />
          </div>
          <Sheen step={3} delay={2 + index * 0.12} className="mt-4 rounded-xl">
            <div className="text-8xl leading-none font-semibold tracking-[-0.03em]">
              <Accent>
                <AnnBCountDown
                  from={fix.from}
                  to={fix.to}
                  decimals={1}
                  step={3}
                  duration={1.6}
                  delay={0.35 + index * 0.12}
                />
              </Accent>
            </div>
          </Sheen>
          <div className="mt-3 text-xl text-white/60">{fix.unit}</div>
        </div>
      ))}
    </div>
  );
}

export function AnnualOcc() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Performance</Kicker>
        <Title size="md">The database was fighting itself.</Title>
        <Body className="mt-4 max-w-3xl text-lg">
          Almost all the load was writes colliding, not reads.
        </Body>
      </Reveal>

      <div className="relative mt-10 h-[340px]">
        <Beat active={step <= 1}>
          <MoA3CollisionChart filled={step >= 1} />
        </Beat>
        <Beat active={step === 2}>
          <MoA3CollisionCause active={step === 2} />
        </Beat>
        <Beat active={step >= 3}>
          <FixFigures />
        </Beat>
      </div>

      <Footnote>
        Three days of live traffic; the fixes landed 24 August 2026.
      </Footnote>
    </Shell>
  );
}
