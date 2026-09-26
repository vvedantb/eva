import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useMotionCue } from "../../_components/DeckPrimitives";
import {
  DUR,
  EASE,
  MaskedText,
  Sheen,
  SplitReveal,
  cueTransition,
} from "../../_components/motion";

/**
 * "60–120 → 2 writes during a run". The old range arrives bright, is struck
 * through and falls back, the arrow slides across, then the 2 lands big with a
 * pass of light. The 2 is the hero; everything before it is the set-up.
 */
export function MoA1WriteDrop({
  step,
  className,
}: {
  step: number;
  className?: string;
}) {
  const { on } = useMotionCue(step);
  const strike = 0.55;

  return (
    <div className={cn("flex items-baseline gap-7", className)}>
      <span className="relative text-5xl leading-none tabular-nums">
        <m.span
          className="inline-block"
          initial={{ opacity: 0, color: "rgba(255,255,255,0.75)" }}
          animate={
            on
              ? { opacity: 1, color: "rgba(255,255,255,0.3)" }
              : { opacity: 0, color: "rgba(255,255,255,0.75)" }
          }
          transition={
            on
              ? {
                  opacity: { duration: DUR.base, delay: 0.05 },
                  color: { duration: DUR.slow, ease: EASE.out, delay: strike },
                }
              : { duration: DUR.fast }
          }
        >
          <MaskedText step={step} delay={0.05} duration={DUR.slow}>
            60&ndash;120
          </MaskedText>
        </m.span>
        <m.span
          aria-hidden
          className="absolute inset-x-[-4px] top-[55%] h-0.5 origin-left rounded-full bg-white/45"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: on ? 1 : 0 }}
          transition={cueTransition(on, strike, {
            duration: DUR.base,
            ease: EASE.inOut,
          })}
        />
      </span>

      <m.span
        className="text-3xl text-white/25"
        initial={{ opacity: 0, x: -14 }}
        animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
        transition={cueTransition(on, strike + 0.2, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        &rarr;
      </m.span>

      <m.span
        className="inline-block origin-bottom-left"
        initial={{ scale: 0.8 }}
        animate={{ scale: on ? 1 : 0.8 }}
        transition={cueTransition(on, strike + 0.35, {
          duration: 1.1,
          ease: EASE.expo,
        })}
      >
        <Sheen step={step} delay={strike + 0.75} className="-mx-3 px-3">
          <SplitReveal
            text="2"
            step={step}
            delay={strike + 0.35}
            className="text-6xl leading-none font-semibold text-white"
          />
        </Sheen>
      </m.span>

      <span className="ml-5 text-lg text-white/50">
        <MaskedText step={step} delay={strike + 0.6} stagger={0.05}>
          writes during a run
        </MaskedText>
      </span>
    </div>
  );
}
