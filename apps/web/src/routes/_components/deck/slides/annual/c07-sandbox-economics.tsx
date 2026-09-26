import { m } from "motion/react";
import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  Spotlight,
} from "../../_components/motion";
import { GraceBar, SnapshotStack } from "../_parts/AnnCLifecycleBeats";
import { MoA3WeeklySweep } from "../_parts/MoA3WeeklySweep";

const STAGES: readonly { label: string; step: number }[] = [
  { label: "One snapshot kept", step: 1 },
  { label: "48-hour grace", step: 2 },
  { label: "Weekly sweep", step: 3 },
];

/** The content block is 1088px wide; each station sits at the centre of a third. */
const BLOCK_W = 1088;
const BLEED = 300;
const stationX = (index: number) => ((index * 2 + 1) / 6) * BLOCK_W;
/** The light walks from station to station with the build. */
const LIGHT = [
  null,
  ...STAGES.map((_, index) => ({
    x: BLEED + stationX(index),
    y: BLEED + 170,
    size: 520,
  })),
];

/** One lifecycle track, filling station by station, with a lit head on the fill. */
function Track({ step }: { step: number }) {
  /** The track fills to each station as it arrives, and to the end on the last. */
  const fill = step >= 3 ? 1 : step === 0 ? 0 : (step * 2 - 1) / 6;
  const travel = { duration: DUR.hero + 0.2, ease: EASE.expo };

  return (
    <div className="relative mt-8 h-3">
      <div className="absolute inset-x-0 top-[5px] h-[2px] rounded-full bg-white/10" />
      <m.div
        className="absolute inset-x-0 top-[5px] h-[2px] origin-left rounded-full"
        style={{ background: BRAND_GRADIENT }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: fill }}
        transition={travel}
      />
      <m.span
        aria-hidden
        className="absolute top-[6px] left-0 -mt-[12px] -ml-[12px] size-6 rounded-full"
        style={{
          background: `radial-gradient(circle, #fff 0 18%, ${BRAND.blue}88 36%, transparent 70%)`,
        }}
        initial={{ x: 0, opacity: 0 }}
        animate={{
          x: fill * BLOCK_W,
          opacity: step === 0 || step >= 3 ? 0 : 1,
        }}
        // On the last beat the head runs off the end of the track and goes out.
        transition={{
          x: travel,
          opacity: { duration: DUR.slow, delay: step >= 3 ? 0.6 : 0 },
        }}
      />
      {STAGES.map((stage, index) => {
        const reached = step >= stage.step;
        const arriving = step === stage.step;
        return (
          <span
            key={stage.label}
            aria-hidden
            className="absolute top-0 size-3 -translate-x-1/2"
            style={{ left: stationX(index) }}
          >
            {/* One ring leaves the station as the fill arrives. */}
            <m.span
              className="absolute inset-0 rounded-full"
              style={{ border: `1.5px solid ${BRAND.blue}` }}
              initial={{ scale: 1, opacity: 0 }}
              animate={
                arriving
                  ? { scale: [1, 3.4], opacity: [0.8, 0] }
                  : { scale: 1, opacity: 0 }
              }
              transition={
                arriving
                  ? { duration: 1, ease: EASE.out, delay: 0.55 }
                  : { duration: 0 }
              }
            />
            <m.span
              className="absolute inset-0 rounded-full"
              style={{ background: BRAND_GRADIENT }}
              animate={{
                scale: reached ? 1.25 : 0.8,
                opacity: reached ? 1 : 0.35,
              }}
              transition={{
                duration: DUR.slow,
                ease: EASE.expo,
                delay: reached ? 0.5 : 0,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

export function AnnualSandboxEconomics() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Platform · Running costs</Kicker>
        <Title size="md">Workspaces clean up after themselves.</Title>
        <Body className="mt-4 max-w-3xl text-lg">
          Nothing keeps billing once the work is finished.
        </Body>
      </Reveal>

      <div className="relative isolate flex flex-1 flex-col justify-center pb-2">
        <div
          className="pointer-events-none absolute isolate -z-10"
          style={{ inset: -BLEED }}
        >
          <Spotlight shots={LIGHT} />
        </div>

        <div className="grid grid-cols-3">
          {STAGES.map((stage, index) => {
            const live = step >= stage.step;
            return (
              <m.div
                key={stage.label}
                className="flex justify-center"
                initial={{ opacity: 0.25, scale: 0.96 }}
                animate={{ opacity: live ? 1 : 0.25, scale: live ? 1 : 0.96 }}
                transition={
                  live
                    ? { duration: DUR.slow, ease: EASE.expo }
                    : { duration: DUR.fast, ease: EASE.out }
                }
              >
                {index === 0 ? <SnapshotStack live={live} /> : null}
                {index === 1 ? <GraceBar live={live} /> : null}
                {index === 2 ? <MoA3WeeklySweep live={live} /> : null}
              </m.div>
            );
          })}
        </div>

        <Track step={step} />

        <div className="mt-8 grid grid-cols-3">
          {STAGES.map((stage) => {
            const live = step >= stage.step;
            return (
              <m.div
                key={stage.label}
                className="text-center text-2xl font-medium text-white/90"
                initial={{ opacity: 0.3, y: 8 }}
                animate={{ opacity: live ? 1 : 0.3, y: live ? 0 : 8 }}
                transition={
                  live
                    ? { duration: DUR.hero, ease: EASE.expo, delay: 0.15 }
                    : { duration: DUR.fast, ease: EASE.out }
                }
              >
                {stage.label}
              </m.div>
            );
          })}
        </div>
      </div>

      <Footnote>Snapshot lifecycle documented in the repository.</Footnote>
    </Shell>
  );
}
