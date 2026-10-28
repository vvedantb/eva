import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BeeLogo } from "./_parts/BeeLogo";
import type { LogoState } from "./_parts/BeeLogo";

const LANDED = 1;
const SETTLED = 2;

/**
 * The flight in: from off the left edge, a loose loop across the stage, then
 * down into its place above the title. Offsets are from the resting spot.
 */
const FLIGHT = {
  x: [-760, -420, -40, 320, 180, -60, 0],
  y: [220, -60, -170, 10, 150, 40, 0],
  rotate: [14, -10, -4, 12, -8, 4, 0],
  scale: [0.5, 0.62, 0.7, 0.78, 0.86, 0.95, 1],
  opacity: [0, 1, 1, 1, 1, 1, 1],
};

const FLIGHT_TRANSITION: Transition = {
  duration: 2.4,
  delay: 0.2,
  ease: "easeInOut",
  times: [0, 0.16, 0.36, 0.56, 0.74, 0.9, 1],
};

/** Searching while it flies, a loop and sparkle as it lands, then idle. */
function logoState(step: number): LogoState {
  if (step >= SETTLED) return "idle";
  if (step >= LANDED) return "done";
  return "searching";
}

export function BeeTitle() {
  const step = useDeckStep();
  const landed = step >= LANDED;
  const settled = step >= SETTLED;

  return (
    <Shell center className="gap-8">
      <m.div
        initial={{ opacity: 0, x: -760, y: 220, scale: 0.5 }}
        animate={FLIGHT}
        transition={FLIGHT_TRANSITION}
      >
        {/* Once it is down, a slow hover, as if it is flying in place. */}
        <m.div
          animate={settled ? { y: [0, -8, 0] } : { y: 0 }}
          transition={
            settled
              ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: DUR.base }
          }
        >
          <BeeLogo size={168} state={logoState(step)} />
        </m.div>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={
          landed
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: 18, scale: 0.96 }
        }
        transition={cueTransition(landed, 0.15, {
          duration: DUR.hero,
          ease: EASE.expo,
        })}
      >
        <Title size="xl">
          <Accent>Bee</Accent>
        </Title>
      </m.div>

      <m.p
        className="text-3xl text-balance text-[#2a1e0c]/70"
        initial={{ opacity: 0, y: 14 }}
        animate={settled ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={cueTransition(settled, 0.1, {
          duration: DUR.hero,
          ease: EASE.expo,
        })}
      >
        It listens to your meeting and finds what you already know
      </m.p>
    </Shell>
  );
}
