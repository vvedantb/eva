import { m } from "motion/react";
import {
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
import {
  GraceBar,
  SnapshotStack,
  WeeklySweep,
} from "../_parts/AnnCLifecycleBeats";

const STAGES: readonly { label: string; step: number }[] = [
  { label: "One snapshot kept", step: 1 },
  { label: "48-hour grace", step: 2 },
  { label: "Weekly sweep", step: 3 },
];

export function AnnualSandboxEconomics() {
  const step = useDeckStep();
  /** The track fills to each station as it arrives, and to the end on the last. */
  const fill = step >= 3 ? 1 : step === 0 ? 0 : (step * 2 - 1) / 6;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Running costs</Kicker>
        <Title size="md">What a workspace costs.</Title>
        <Body className="mt-4 max-w-3xl text-lg">
          Nothing keeps billing once the work is finished.
        </Body>
      </Reveal>

      <div className="flex flex-1 flex-col justify-center pb-2">
        <div className="grid grid-cols-3">
          {STAGES.map((stage, index) => {
            const live = step >= stage.step;
            return (
              <m.div
                key={stage.label}
                className="flex justify-center"
                animate={{ opacity: live ? 1 : 0.25 }}
                transition={{ duration: live ? 0.5 : 0.3, ease: EASE_OUT }}
              >
                {index === 0 ? <SnapshotStack live={live} /> : null}
                {index === 1 ? <GraceBar live={live} /> : null}
                {index === 2 ? <WeeklySweep live={live} /> : null}
              </m.div>
            );
          })}
        </div>

        {/* One lifecycle track, filling station by station. */}
        <div className="relative mt-8 h-3">
          <div className="absolute inset-x-0 top-[5px] h-[2px] rounded-full bg-white/10" />
          <m.div
            className="absolute inset-x-0 top-[5px] h-[2px] origin-left rounded-full"
            style={{
              background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: fill }}
            transition={{ type: "spring", bounce: 0, duration: 0.9 }}
          />
          {STAGES.map((stage, index) => (
            <m.span
              key={stage.label}
              aria-hidden
              className="absolute top-0 size-3 -translate-x-1/2 rounded-full"
              style={{
                left: `${((index * 2 + 1) / 6) * 100}%`,
                background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
              }}
              animate={{
                scale: step >= stage.step ? 1.25 : 0.8,
                opacity: step >= stage.step ? 1 : 0.35,
              }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-3">
          {STAGES.map((stage) => (
            <m.div
              key={stage.label}
              className="text-center text-2xl font-medium text-white/90"
              animate={{
                opacity: step >= stage.step ? 1 : 0.3,
                y: step >= stage.step ? 0 : 6,
              }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            >
              {stage.label}
            </m.div>
          ))}
        </div>
      </div>

      <Footnote>Snapshot lifecycle documented in the repository.</Footnote>
    </Shell>
  );
}
