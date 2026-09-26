import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, MaskedText } from "../../_components/motion";
import {
  MOA3_BROKEN_RUN,
  MOA3_DURABLE_RUN,
  MoA3DurableTrack,
} from "../_parts/MoA3DurableTrack";

export function AnnualDurable() {
  const step = useDeckStep();
  const durable = step >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Craft · Reliability</Kicker>
        <Title size="md">Finishing what it starts.</Title>
      </Reveal>

      <div className="mt-28 h-[72px]">
        <MoA3DurableTrack durable={durable} closing={step >= 2} />
      </div>

      <div className="relative mt-14 h-10 overflow-hidden text-center">
        <m.p
          className="absolute inset-x-0 text-xl text-white/55"
          initial={{ opacity: 0, y: 14 }}
          animate={durable ? { opacity: 0, y: -10 } : { opacity: 1, y: 0 }}
          transition={
            durable
              ? { duration: DUR.base, ease: EASE.in }
              : {
                  duration: DUR.hero,
                  ease: EASE.expo,
                  delay: MOA3_BROKEN_RUN + 0.2,
                }
          }
        >
          Stuck on Working
        </m.p>
        <m.p
          className="absolute inset-x-0 text-xl text-white/85"
          initial={{ opacity: 0, y: 14 }}
          animate={durable ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          transition={
            durable
              ? {
                  duration: DUR.hero,
                  ease: EASE.expo,
                  delay: MOA3_DURABLE_RUN - 0.2,
                }
              : { duration: DUR.fast }
          }
        >
          Interrupted, then finished
        </m.p>
      </div>

      <div className="mt-16 text-center">
        <MaskedText step={2} className="text-3xl text-white/85">
          Interrupted is no longer the same as <Accent>lost</Accent>.
        </MaskedText>
      </div>

      <Footnote>
        One durable lifecycle for every turn, 19 August 2026; remaining gaps
        closed 23 August 2026.
      </Footnote>
    </Shell>
  );
}
