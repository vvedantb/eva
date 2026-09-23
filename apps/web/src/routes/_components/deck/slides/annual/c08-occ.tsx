import type { ReactNode } from "react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Body,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { AnnBCountDown } from "../_parts/AnnBCountDown";

/** Retry counts from three days of live traffic, by where they came from. */
const SOURCES: readonly { label: string; value: number }[] = [
  { label: "Presence heartbeats", value: 30 },
  { label: "Streaming touches", value: 24 },
  { label: "Lease renewals", value: 18 },
  { label: "Stall watchdog", value: 17 },
];

const MAX_BAR = 540;
const PEAK = 30;

/** Each beat owns the stage in turn, so only one idea is ever on screen. */
function Beat({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <m.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
      animate={
        active
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: -10, filter: "blur(6px)" }
      }
      transition={{
        duration: active ? 0.55 : 0.4,
        ease: EASE_OUT,
        delay: active ? 0.15 : 0,
      }}
    >
      {children}
    </m.div>
  );
}

function CollisionChart({ filled }: { filled: boolean }) {
  return (
    <div className="flex h-full flex-col justify-center gap-6">
      {SOURCES.map((source, index) => {
        const width = (MAX_BAR * source.value) / PEAK;
        return (
          <div key={source.label} className="flex items-center gap-6">
            <div className="w-[230px] shrink-0 text-right text-sm text-white/55">
              {source.label}
            </div>

            <div
              className="h-7 shrink-0 rounded-[8px] bg-white/[0.07]"
              style={{ width }}
            >
              <m.div
                className="h-full origin-left rounded-[8px]"
                style={{
                  background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: filled ? 1 : 0 }}
                transition={{
                  duration: filled ? 0.8 : 0.25,
                  ease: EASE_OUT,
                  delay: filled ? 0.25 + index * 0.1 : 0,
                }}
              />
            </div>

            <m.div
              className="text-lg tabular-nums text-white/70"
              animate={{ opacity: filled ? 1 : 0 }}
              transition={{
                duration: 0.4,
                ease: EASE_OUT,
                delay: filled ? 0.6 + index * 0.1 : 0,
              }}
            >
              {source.value}
            </m.div>
          </div>
        );
      })}
    </div>
  );
}

function Writer({
  label,
  active,
  travel,
}: {
  label: string;
  active: boolean;
  travel: number;
}) {
  return (
    <m.div
      className="flex h-[74px] w-[200px] items-center justify-center rounded-[16px] bg-white/[0.06] text-base text-white/75"
      initial={{ x: 0, opacity: 0 }}
      animate={{ x: active ? travel : 0, opacity: active ? 1 : 0 }}
      transition={{
        duration: active ? 0.9 : 0.25,
        ease: EASE_OUT,
        delay: active ? 0.3 : 0,
      }}
    >
      {label}
    </m.div>
  );
}

function CollisionCause({ active }: { active: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-28">
      <Writer label="One writer" active={active} travel={64} />

      <m.div
        className="flex h-[96px] w-[250px] items-center justify-center rounded-[20px] text-lg font-medium text-white"
        style={{
          background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        animate={{ scale: active ? [1, 1.07, 1] : 1 }}
        transition={{
          duration: active ? 0.5 : 0.25,
          ease: EASE_OUT,
          delay: active ? 1.05 : 0,
        }}
      >
        The same row
      </m.div>

      <Writer label="Another writer" active={active} travel={-64} />
    </div>
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
  return (
    <div className="flex h-full items-center justify-center gap-44">
      {FIXES.map((fix) => (
        <div key={fix.label} className="flex flex-col items-center">
          <div className="text-sm text-white/45">{fix.label}</div>
          <div className="mt-2 text-lg tabular-nums text-white/35">
            {fix.before}
          </div>
          <div className="mt-4 text-8xl leading-none font-semibold tracking-[-0.03em]">
            <Accent>
              <AnnBCountDown
                from={fix.from}
                to={fix.to}
                decimals={1}
                step={3}
                duration={1.6}
                delay={0.35}
              />
            </Accent>
          </div>
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
        <Kicker>Debugging</Kicker>
        <Title size="md">The database was fighting itself.</Title>
        <Body className="mt-4 max-w-3xl text-lg">
          Almost all the load was writes colliding, not reads.
        </Body>
      </Reveal>

      <div className="relative mt-10 h-[340px]">
        <Beat active={step <= 1}>
          <CollisionChart filled={step >= 1} />
        </Beat>
        <Beat active={step === 2}>
          <CollisionCause active={step === 2} />
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
