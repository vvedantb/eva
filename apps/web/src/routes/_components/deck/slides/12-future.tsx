import type { ReactNode } from "react";
import { IconArrowBackUp, IconCloud, IconRobot } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import { DUR, EASE, LEAVE, Sheen, cueTransition } from "../_components/motion";
import { Camera } from "../_components/DeckCamera";
import type { CameraShot } from "../_components/DeckCamera";
import { AgentFleet } from "./_parts/AgentFleet";

/**
 * Starts off-axis, looking in at the fleet from the side, then straightens and
 * pushes in as the nine agents light up on the last step.
 */
const FLEET_SHOTS: readonly CameraShot[] = [
  { rotateY: 8, translateZ: -40 },
  { rotateY: 5, translateZ: -20 },
  { rotateY: 2, translateZ: 0 },
  // The final push is small and paired with a scale-down: at translateZ 70 the
  // fleet grew past the top of the 720px stage and clipped the chat window.
  { rotateY: 0, translateZ: 30, scale: 0.94 },
];

interface Shift {
  step: number;
  icon: ReactNode;
  heading: string;
}

/** The line under each heading lives in the speaker notes. */
const SHIFTS: readonly Shift[] = [
  {
    step: 1,
    icon: <IconRobot size={24} stroke={1.6} className="text-white" />,
    heading: "More automations",
  },
  {
    step: 2,
    icon: <IconArrowBackUp size={24} stroke={1.6} className="text-white" />,
    heading: "Mistakes become cheap",
  },
  {
    step: 3,
    icon: <IconCloud size={24} stroke={1.6} className="text-white" />,
    heading: "Everything in sandboxes, managed from chat",
  },
];

/** A shift lands from the left; the one before it steps back. */
function ShiftCard({ shift }: { shift: Shift }) {
  const step = useDeckStep();
  const shown = step >= shift.step;
  const current = step === shift.step;

  return (
    <m.div
      initial={{ opacity: 0, x: -40 }}
      animate={
        shown ? { opacity: current ? 1 : 0.55, x: 0 } : { opacity: 0, x: -40 }
      }
      transition={
        shown
          ? {
              x: { duration: DUR.hero, ease: EASE.expo },
              opacity: { duration: current ? DUR.base : DUR.slow },
            }
          : LEAVE
      }
    >
      <Sheen step={shift.step} delay={0.45} className="rounded-[20px]">
        <div className="flex h-[84px] items-center gap-5 rounded-[20px] bg-white/[0.05] px-6">
          <m.div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B3FB8]/35 to-[#3B7DD8]/35"
            initial={{ scale: 0.5, rotate: -12, opacity: 0 }}
            animate={
              shown
                ? { scale: 1, rotate: 0, opacity: 1 }
                : { scale: 0.5, rotate: -12, opacity: 0 }
            }
            transition={cueTransition(shown, 0.18, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            {shift.icon}
          </m.div>
          <div className="text-xl leading-tight font-semibold text-balance text-white">
            {shift.heading}
          </div>
        </div>
      </Sheen>
    </m.div>
  );
}

export function Slide12Future() {
  return (
    <Shell className="py-14">
      <div className="grid min-h-0 flex-1 grid-cols-[532px_1fr] gap-4 pb-8">
        <div>
          <Reveal>
            <Kicker>What&apos;s next · Direction</Kicker>
            <Title size="lg" className="leading-[1.02] tracking-[-0.025em]">
              Manage agents,
              <br />
              not tasks.
            </Title>
          </Reveal>
          <Reveal delay={0.6}>
            <Body className="mt-5 text-lg">
              Three shifts, each already true inside Eva.
            </Body>
          </Reveal>

          <div className="mt-10 flex w-[500px] flex-col gap-4">
            {SHIFTS.map((shift) => (
              <ShiftCard key={shift.heading} shift={shift} />
            ))}
          </div>
        </div>

        {/* The fleet sits on the middle of the column, level with the shifts,
            rather than hanging from the top of it. */}
        <Camera shots={FLEET_SHOTS} className="h-full">
          <div className="flex h-full items-center justify-center">
            <AgentFleet />
          </div>
        </Camera>
      </div>

      <Footnote>
        A direction of travel, not a plan. Everything on this slide is already
        true for how Eva itself is built.
      </Footnote>
    </Shell>
  );
}
