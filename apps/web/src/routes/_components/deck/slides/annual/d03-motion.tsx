import { m } from "motion/react";
import {
  ANN_C_HOUSE_CYCLE,
  ANN_C_MOTION_SAMPLES,
  ANN_C_SYNC_HOLD,
  AnnCMotionSample,
} from "../_parts/AnnCMotionSample";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  Pulse,
  Sheen,
} from "../../_components/motion";

/** Content width inside the Shell gutters. */
const WIDTH = 1088;
const COLUMNS = 5;

export function AnnualMotion() {
  const step = useDeckStep();
  const synced = step >= 1;
  const closing = step >= 2;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Motion</Kicker>
        <Title size="md">One set of rules for motion.</Title>
      </Reveal>

      {/* Hands the room to the closing line on step 2. */}
      <m.div
        className="mt-12"
        initial={false}
        animate={
          closing ? { opacity: 0.6, scale: 0.975 } : { opacity: 1, scale: 1 }
        }
        transition={{ duration: DUR.slow, ease: EASE.out }}
      >
        {/* The sync is a single band of light crossing all ten at once. */}
        <Sheen step={1} duration={1.2} className="rounded-[14px]">
          <div className="grid grid-cols-5 gap-4">
            {ANN_C_MOTION_SAMPLES.map((spec, index) => {
              const wave =
                0.35 + ((index % COLUMNS) + Math.floor(index / COLUMNS)) * 0.05;
              return (
                <m.div
                  key={spec.label}
                  initial={{ opacity: 0, y: 22, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: DUR.slow,
                    ease: EASE.expo,
                    delay: wave,
                  }}
                >
                  <AnnCMotionSample spec={spec} synced={synced} />
                </m.div>
              );
            })}
          </div>
        </Sheen>

        {/* One rule under all ten: it draws as they fall into step. */}
        <DrawPath
          d={`M0 1 L${WIDTH} 1`}
          width={WIDTH}
          height={2}
          step={1}
          delay={0.1}
          duration={1.1}
          strokeWidth={1.5}
          dot
          className="mt-7"
        />

        <div className="mt-7 flex items-center justify-center gap-3 text-base text-white/50">
          <m.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={
              synced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }
            }
            transition={{
              duration: DUR.base,
              ease: EASE.out,
              delay: synced ? ANN_C_SYNC_HOLD : 0,
            }}
            className="flex"
          >
            {/* Beats once per house cycle, in time with the ten. */}
            <Pulse
              step={1}
              delay={ANN_C_SYNC_HOLD}
              period={ANN_C_HOUSE_CYCLE}
              rings={1}
              size={7}
            />
          </m.span>
          <MaskedText step={1} delay={0.6} duration={DUR.slow}>
            One duration, one curve, one rest
          </MaskedText>
        </div>
      </m.div>

      <p className="mt-12 text-center text-3xl text-white/85">
        <MaskedText step={2} delay={0.1}>
          Motion is now a <Accent>house style</Accent>, not an opinion.
        </MaskedText>
      </p>

      <Footnote>Ten motion changes, 7 August 2026.</Footnote>
    </Shell>
  );
}
