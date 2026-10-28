import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../../_components/DeckPrimitives";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BeeIsland } from "../_parts/BeeIsland";
import { BeeLogo } from "../_parts/BeeLogo";

const LANDED = 1;
const ASK = 2;

const FLY: Transition = { duration: 1.6, ease: [0.45, 0, 0.25, 1], delay: 0.5 };

export function DraftCloseLanding() {
  const step = useDeckStep();
  const landed = step >= LANDED;
  const ask = step >= ASK;

  return (
    <Shell center className="gap-10">
      {/* Your screen, with an empty spot where the bar lives. */}
      <div className="relative h-[300px] w-[760px] rounded-[26px] bg-[#e9e3d6] ring-1 ring-[#2a1e0c]/10">
        <div className="absolute top-4 left-1/2 -translate-x-1/2">
          <m.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={
              landed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }
            }
            transition={cueTransition(landed, 0, {
              duration: DUR.slow,
              ease: EASE.out,
            })}
          >
            <BeeIsland status="Listening…" listening width={420} />
          </m.div>
          {!landed && (
            <div className="absolute top-1 left-1/2 h-[58px] w-[420px] -translate-x-1/2 rounded-full border-2 border-dashed border-[#2a1e0c]/20" />
          )}
        </div>

        {/* The bee flies up from the middle into its place in the bar. */}
        <m.div
          className="absolute top-[150px] left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ x: 0, y: 40, scale: 1.6, opacity: 0 }}
          animate={
            landed
              ? { x: -170, y: -120, scale: 0.42, opacity: 0 }
              : { x: 0, y: 0, scale: 1.6, opacity: 1 }
          }
          transition={landed ? { duration: 0.5, ease: EASE.in } : FLY}
        >
          <BeeLogo size={80} state="flying" glow={false} />
        </m.div>
      </div>

      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={ask ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={cueTransition(ask, 0.1, {
          duration: DUR.hero,
          ease: EASE.expo,
        })}
      >
        <Title size="lg">
          Try it in your <Accent>next meeting</Accent>
        </Title>
      </m.div>
    </Shell>
  );
}
