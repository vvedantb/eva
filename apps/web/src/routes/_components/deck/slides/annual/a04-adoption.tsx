import { CountUp } from "../../_components/CountUp";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Accent,
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";
import { AnnualAdoptionChart } from "../_parts/AnnualAdoptionChart";

/**
 * A three-quarter view gives the bars some body, then the camera swings
 * towards the July-onwards months as they are picked out, and squares up for
 * the summary. The angles stay shallow because the month labels and the count
 * above each bar are 12px and have to survive the rotation.
 */
const ADOPTION_SHOTS: readonly CameraShot[] = [
  { rotateY: -8, rotateX: 5, translateZ: -20 },
  { rotateY: -4, rotateX: 3, x: 30 },
  {},
];

/** Left to right: who, what for, what came of it. Sentences are in the notes. */
const FIGURES: readonly { value: number; label: string; accent?: boolean }[] = [
  { value: 13, label: "colleagues raising work", accent: true },
  { value: 390, label: "for CarePulse" },
  { value: 225, label: "ready to review" },
];

export function AnnualAdoption() {
  return (
    <Shell className="py-12">
      <Reveal from="none">
        <Kicker>How it took hold</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="md">From one person to the whole team.</Title>
      </Reveal>
      <Reveal delay={0.25}>
        <Body className="mt-4 max-w-4xl text-lg">
          Every bar is a month of work raised in Eva. The habit spread as the
          tool got easier to use.
        </Body>
      </Reveal>

      <Camera shots={ADOPTION_SHOTS} className="mt-4">
        <AnnualAdoptionChart />
      </Camera>

      <Stagger
        step={2}
        delayChildren={0.1}
        staggerChildren={0.1}
        className="mt-8 grid grid-cols-3 gap-6"
      >
        {FIGURES.map((figure, index) => (
          <StaggerItem key={figure.label}>
            <div className="text-6xl leading-none font-semibold tabular-nums">
              {figure.accent ? (
                <Accent>
                  <CountUp value={figure.value} step={2} delay={0.2} />
                </Accent>
              ) : (
                <span className="text-white">
                  <CountUp
                    value={figure.value}
                    step={2}
                    delay={0.2 + index * 0.1}
                  />
                </span>
              )}
            </div>
            <div className="mt-3 text-base text-white/50">{figure.label}</div>
          </StaggerItem>
        ))}
      </Stagger>

      <Footnote>
        Counts are sessions created per calendar month in Eva, to 16 September
        2026. June 2026 has none recorded.
      </Footnote>
    </Shell>
  );
}
