import { IconCalendarRepeat } from "@tabler/icons-react";
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

const VISUAL_HEIGHT = 170;

/** Three snapshots arrive; the two older ones are dropped and one is kept. */
function SnapshotStack({ step }: { step: number }) {
  const live = useDeckStep() >= step;

  return (
    <div className="relative w-[180px]" style={{ height: VISUAL_HEIGHT }}>
      {[2, 1, 0].map((layer) => {
        const kept = layer === 0;
        return (
          <m.div
            key={layer}
            className="absolute h-[92px] w-[136px] rounded-[16px] bg-white/[0.07]"
            style={{ left: layer * 20, top: 25 + layer * 14 }}
            initial={{ opacity: 0, y: 14 }}
            animate={{
              opacity: live ? (kept ? 1 : [0, 0.55, 0.55, 0]) : 0,
              y: live ? 0 : 14,
              boxShadow:
                live && kept
                  ? `0 0 0 1px ${BRAND.blue}77`
                  : "0 0 0 1px rgba(255,255,255,0)",
            }}
            transition={{
              duration: live ? (kept ? 0.6 : 1.8) : 0.3,
              ease: EASE_OUT,
              delay: live ? 0.1 + (2 - layer) * 0.12 : 0,
              times: live && !kept ? [0, 0.2, 0.55, 1] : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/** The grace period, as a figure falling to zero over a draining bar. */
function GraceCountdown({ step }: { step: number }) {
  const live = useDeckStep() >= step;

  return (
    <div
      className="flex w-[240px] flex-col justify-center"
      style={{ height: VISUAL_HEIGHT }}
    >
      <div className="flex items-baseline gap-3">
        <span className="text-7xl leading-none font-semibold tracking-[-0.02em]">
          <Accent>
            <AnnBCountDown from={48} to={0} step={step} delay={0.25} />
          </Accent>
        </span>
        <span className="text-lg text-white/55">hours left</span>
      </div>

      <div className="mt-6 h-2.5 w-[210px] overflow-hidden rounded-full bg-white/10">
        <m.div
          className="h-full origin-left rounded-full"
          style={{
            background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: live ? 0 : 1 }}
          transition={{
            duration: live ? 1.4 : 0.3,
            ease: EASE_OUT,
            delay: live ? 0.25 : 0,
          }}
        />
      </div>
    </div>
  );
}

/** A light passes across and whatever is left over goes with it. */
function Sweep({ step }: { step: number }) {
  const live = useDeckStep() >= step;

  return (
    <div
      className="relative w-[210px] overflow-hidden"
      style={{ height: VISUAL_HEIGHT }}
    >
      <div className="flex h-full w-[190px] flex-wrap content-center gap-3">
        {[0, 1, 2, 3, 4, 5].map((tile) => (
          <m.div
            key={tile}
            className="h-[42px] w-[42px] rounded-[12px] bg-white/[0.08]"
            animate={{ opacity: live ? 0 : 1, scale: live ? 0.7 : 1 }}
            transition={{
              duration: live ? 0.5 : 0.3,
              ease: EASE_OUT,
              delay: live ? 0.35 + tile * 0.07 : 0,
            }}
          />
        ))}
      </div>

      <m.div
        className="absolute inset-y-0 w-[80px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${BRAND.blue}55, transparent)`,
        }}
        initial={{ x: -100 }}
        animate={{ x: live ? 240 : -100 }}
        transition={{ duration: live ? 1.2 : 0.3, ease: EASE_OUT }}
        aria-hidden
      />
    </div>
  );
}

const STAGES: readonly { label: string; step: number }[] = [
  { label: "One snapshot kept", step: 1 },
  { label: "48-hour grace", step: 2 },
  { label: "Weekly sweep", step: 3 },
];

export function AnnualSandboxEconomics() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Running costs</Kicker>
        <Title size="md">What a workspace costs.</Title>
        <Body className="mt-4 max-w-3xl text-lg">
          Nothing keeps billing once the work is finished.
        </Body>
      </Reveal>

      <div className="flex flex-1 items-center pb-10">
        <div className="grid w-full grid-cols-3 items-center gap-10">
          {STAGES.map((stage, index) => (
            <div key={stage.label} className="flex flex-col items-center">
              {index === 0 ? <SnapshotStack step={stage.step} /> : null}
              {index === 1 ? <GraceCountdown step={stage.step} /> : null}
              {index === 2 ? <Sweep step={stage.step} /> : null}

              <m.div
                className="mt-6 flex items-center gap-2.5 text-lg"
                animate={{
                  opacity: step >= stage.step ? 1 : 0.3,
                  color:
                    step >= stage.step
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.4)",
                }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                {index === 2 ? (
                  <IconCalendarRepeat
                    size={20}
                    stroke={1.6}
                    className="text-white/60"
                    aria-hidden
                  />
                ) : null}
                {stage.label}
              </m.div>
            </div>
          ))}
        </div>
      </div>

      <Footnote>Snapshot lifecycle documented in the repository.</Footnote>
    </Shell>
  );
}
