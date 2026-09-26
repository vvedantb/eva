import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  EASE,
  GridBackdrop,
  LEAVE,
  MaskedText,
  STAGGER,
  Sheen,
  cueTransition,
} from "../../_components/motion";
import type { AnnualPhase } from "../_parts/AnnualPhasePipeline";
import { AnnualPhasePipeline } from "../_parts/AnnualPhasePipeline";
import { MoA3AccentRoll } from "../_parts/MoA3AccentRoll";

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

/** A hairline struck through a rejected option once it has landed. */
function Strike({ on, delay }: { on: boolean; delay: number }) {
  return (
    <m.span
      aria-hidden
      className="pointer-events-none absolute inset-x-5 top-1/2 h-px origin-left bg-white/45"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: on ? 1 : 0 }}
      transition={cueTransition(on, delay, {
        duration: DUR.slow,
        ease: EASE.inOut,
      })}
    />
  );
}

export function AnnualDesign() {
  const step = useDeckStep();
  const shelved = step >= 3;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Design</Kicker>
        <Title size="md">Decided on paper first.</Title>
        <Body className="mt-3 max-w-3xl text-lg">
          The engine every workspace runs on, replaced in six phases.
        </Body>
      </Reveal>

      <div className="relative isolate mt-16">
        {/* Graph paper under the plan: it drifts, the plan holds still. */}
        <m.div
          aria-hidden
          className="pointer-events-none absolute -inset-x-24 -inset-y-16 -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: step >= 1 ? 1 : 0 }}
          transition={{ duration: DUR.hero, ease: EASE.out }}
        >
          <GridBackdrop variant="dots" cell={28} period={9} />
        </m.div>
        <Camera shots={DESIGN_SHOTS}>
          <AnnualPhasePipeline phases={PHASES} active={step >= 1} />
        </Camera>
      </div>

      <div className="mt-16 flex items-baseline justify-center gap-4">
        <MaskedText step={2} className="text-xl text-white/55">
          A 6GB workspace restores in
        </MaskedText>
        <Sheen step={2} delay={1.2} className="-my-2 rounded-lg py-2">
          <span className="text-5xl leading-none font-semibold tracking-[-0.02em]">
            <MoA3AccentRoll
              value={33}
              step={2}
              duration={1.3}
              delay={0.25}
              format={seconds}
              suffix="s"
            />
          </span>
        </Sheen>
      </div>

      <div className="mt-16 flex justify-center gap-4">
        {OPTIONS.map((option, index) => {
          const delay = index * STAGGER.block;
          return (
            <m.div
              key={option.text}
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={
                shelved
                  ? {
                      opacity: option.rejected ? [0, 1, 0.6] : 1,
                      y: 0,
                      scale: option.rejected ? [0.94, 1, 0.97] : 1,
                    }
                  : { opacity: 0, y: 18, scale: 0.94 }
              }
              transition={
                shelved
                  ? {
                      duration: option.rejected ? 1.4 : DUR.slow,
                      ease: EASE.expo,
                      times: option.rejected ? [0, 0.4, 1] : undefined,
                      delay,
                      y: { duration: DUR.slow, ease: EASE.expo, delay },
                    }
                  : LEAVE
              }
              className={cn(
                "relative rounded-full px-6 py-3 text-[15px]",
                option.rejected
                  ? "bg-white/[0.04] text-white/90"
                  : "bg-white/[0.08] text-white",
              )}
            >
              {option.text}
              {option.rejected ? (
                <Strike on={shelved} delay={delay + 0.45} />
              ) : null}
            </m.div>
          );
        })}
      </div>

      <Footnote>
        Sandbox migration, 6 to 29 July 2026. Rejected options, 5 September
        2026.
      </Footnote>
    </Shell>
  );
}
