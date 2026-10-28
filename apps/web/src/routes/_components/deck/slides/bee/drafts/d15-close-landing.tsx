import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../../_components/DeckPrimitives";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BeeIsland, BeeTip } from "../_parts/BeeIsland";
import { BeeLogo } from "../_parts/BeeLogo";

const LANDED = 1;
const NUDGE = 2;
const ASK = 3;
const SWARM = 4;

/** One width for the bar, listening or open, as in the app. */
const BAR_W = 520;

/**
 * The send-off: bees fly in from both sides and settle around the edges,
 * clear of the bar and the title. Positions are where each one settles.
 */
const SWARM_BEES: readonly {
  from: "left" | "right";
  left: string;
  top: string;
  size: number;
  delay: number;
}[] = [
  { from: "left", left: "6%", top: "14%", size: 64, delay: 0 },
  { from: "left", left: "12%", top: "58%", size: 48, delay: 0.25 },
  { from: "left", left: "3%", top: "80%", size: 40, delay: 0.5 },
  { from: "left", left: "17%", top: "30%", size: 36, delay: 0.7 },
  { from: "right", left: "88%", top: "12%", size: 56, delay: 0.1 },
  { from: "right", left: "82%", top: "48%", size: 72, delay: 0.35 },
  { from: "right", left: "92%", top: "74%", size: 44, delay: 0.6 },
  { from: "right", left: "76%", top: "84%", size: 36, delay: 0.8 },
];

const FLY: Transition = { duration: 1.2, ease: [0.45, 0, 0.25, 1], delay: 0.2 };

export function DraftCloseLanding() {
  const step = useDeckStep();
  const landed = step >= LANDED;
  const nudge = step >= NUDGE;
  const ask = step >= ASK;
  const swarm = step >= SWARM;

  return (
    <Shell center className="gap-10">
      {/* Your screen, with an empty spot where the bar lives. */}
      <div className="relative h-[300px] w-[760px] rounded-[26px] text-left bg-[#e9e3d6] ring-1 ring-[#2a1e0c]/10">
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
            {/* Then Bee does what it does in any meeting: one timely tip. */}
            <BeeIsland
              status={nudge ? "Tip" : "Listening…"}
              listening={!nudge}
              state={nudge ? "done" : "listening"}
              open={nudge}
              openDelay={0.2}
              width={BAR_W}
            >
              <BeeTip shown={nudge} delay={0.45}>
                Your Friday session has finished. Remember to ask if anyone has
                questions
              </BeeTip>
            </BeeIsland>
          </m.div>
          {!landed && (
            <div className="absolute top-1 left-1/2 h-[58px] w-[520px] -translate-x-1/2 rounded-full border-2 border-dashed border-[#2a1e0c]/20" />
          )}
        </div>

        {/* The bee flies up from the middle into its place in the bar. */}
        <m.div
          className="absolute top-[150px] left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ x: 0, y: 40, scale: 1.6, opacity: 0 }}
          animate={
            landed
              ? { x: -220, y: -120, scale: 0.42, opacity: 0 }
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

      {SWARM_BEES.map((bee, index) => {
        const side = bee.from === "left" ? -1 : 1;
        return (
          <m.div
            key={index}
            className="pointer-events-none absolute"
            style={{ left: bee.left, top: bee.top }}
            initial={{ opacity: 0, x: side * 700, y: 80 }}
            animate={
              swarm
                ? { opacity: 1, x: 0, y: [80, -40, 0] }
                : { opacity: 0, x: side * 700, y: 80 }
            }
            transition={
              swarm
                ? {
                    delay: bee.delay,
                    opacity: { duration: 0.3, delay: bee.delay },
                    x: {
                      duration: 1.6,
                      ease: [0.22, 1, 0.36, 1],
                      delay: bee.delay,
                    },
                    y: {
                      duration: 1.6,
                      ease: "easeInOut",
                      times: [0, 0.5, 1],
                      delay: bee.delay,
                    },
                  }
                : { duration: DUR.fast }
            }
          >
            {/* Once in place, each one hovers on its own beat. */}
            <m.div
              animate={
                swarm ? { y: [0, -10, 0], rotate: [0, side * 4, 0] } : { y: 0 }
              }
              transition={{
                duration: 2.4 + (index % 3) * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: bee.delay + 1.6,
              }}
            >
              <BeeLogo size={bee.size} state="flying" glow={false} />
            </m.div>
          </m.div>
        );
      })}
    </Shell>
  );
}
