import {
  ANN_C_MOTION_SAMPLES,
  AnnCMotionSample,
} from "../_parts/AnnCMotionSample";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

export function AnnualMotion() {
  const synced = useDeckStep() >= 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Motion</Kicker>
        <Title size="md">How it moves.</Title>
      </Reveal>

      <Stagger
        delayChildren={0.35}
        staggerChildren={0.07}
        className="mt-12 grid grid-cols-5 gap-4"
      >
        {ANN_C_MOTION_SAMPLES.map((spec) => (
          <StaggerItem key={spec.label}>
            <AnnCMotionSample spec={spec} synced={synced} />
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} distance={8} className="mt-10 text-center">
        <p className="text-base text-white/50">
          One duration, one curve, one rest
        </p>
      </Reveal>

      <Reveal step={2} className="mt-12 text-center">
        <p className="text-3xl text-white/85">
          Motion is now a <Accent>house style</Accent>, not an opinion.
        </p>
      </Reveal>

      <Footnote>Ten motion changes, 7 August 2026.</Footnote>
    </Shell>
  );
}
