import { m } from "motion/react";
import { cn } from "@eva/ui";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Body,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import type { AnnualPhase } from "../_parts/AnnualPhasePipeline";
import { AnnualPhasePipeline } from "../_parts/AnnualPhasePipeline";

/**
 * The rail earns the strongest move on the deck: as the light runs through the
 * phases the camera swings in from the left and the far phases recede, then it
 * straightens to read the restore figure and settles square on.
 */
const DESIGN_SHOTS: readonly CameraShot[] = [
  {},
  { rotateY: 10, translateZ: -40, x: -30 },
  { rotateY: 3, translateZ: 20 },
  {},
];

/** The migration, in the order the phases shipped. */
const PHASES: readonly AnnualPhase[] = [
  { label: "Spike", date: "6 Jul" },
  { label: "Neutral contract", date: "6 Jul" },
  { label: "Old provider behind it", date: "6 Jul" },
  { label: "New provider", date: "7 Jul" },
  { label: "Switched over", date: "25 Jul" },
  { label: "Old code removed", date: "29 Jul" },
];

/** Options that were measured and then put down, kept on the record. */
const OPTIONS: readonly { text: string; rejected: boolean }[] = [
  { text: "7 plans shelved", rejected: false },
  { text: "11% worse — rejected", rejected: true },
  { text: "5× more painting — rejected", rejected: true },
];

/** 33 hundredths, shown as seconds: the count reads 0.00s up to 0.33s. */
const seconds = (n: number) => (n / 100).toFixed(2);

export function AnnualDesign() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Design</Kicker>
        <Title size="md">Decided on paper first.</Title>
        <Body className="mt-3 max-w-3xl text-lg">
          The engine every workspace runs on, replaced in six phases.
        </Body>
      </Reveal>

      <Camera shots={DESIGN_SHOTS} className="mt-16">
        <AnnualPhasePipeline phases={PHASES} active={step >= 1} />
      </Camera>

      <Reveal step={2} className="mt-16">
        <div className="flex items-baseline justify-center gap-4">
          <span className="text-xl text-white/55">
            A 6GB workspace restores in
          </span>
          <span className="text-5xl leading-none font-semibold tracking-[-0.02em]">
            <Accent>
              <CountUp
                value={33}
                step={2}
                duration={1.2}
                delay={0.2}
                format={seconds}
                suffix="s"
              />
            </Accent>
          </span>
        </div>
      </Reveal>

      <div className="mt-16 flex justify-center gap-4">
        {OPTIONS.map((option, index) => (
          <m.div
            key={option.text}
            initial={{ opacity: 0, y: 14, scale: 0.92 }}
            animate={
              step >= 3
                ? { opacity: option.rejected ? 0.6 : 1, y: 0, scale: 1 }
                : { opacity: 0, y: 14, scale: 0.92 }
            }
            transition={
              step >= 3
                ? {
                    type: "spring",
                    bounce: 0,
                    duration: 0.55,
                    delay: index * 0.12,
                  }
                : { duration: 0.2, ease: EASE_OUT }
            }
            className={cn(
              "rounded-full px-6 py-3 text-[15px]",
              option.rejected
                ? "bg-white/[0.04] text-white/90"
                : "bg-white/[0.08] text-white",
            )}
          >
            {option.text}
          </m.div>
        ))}
      </div>

      <Footnote>
        Sandbox migration, 6 to 29 July 2026. Rejected options, 5 September
        2026.
      </Footnote>
    </Shell>
  );
}
