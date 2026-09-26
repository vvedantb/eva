import type { ReactNode } from "react";
import { IconArrowBackUp, IconCloud, IconRobot } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
} from "../_components/DeckPrimitives";
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
    icon: <IconRobot size={28} stroke={1.6} className="text-white/75" />,
    heading: "More automations",
  },
  {
    step: 2,
    icon: <IconArrowBackUp size={28} stroke={1.6} className="text-white/75" />,
    heading: "Mistakes become cheap",
  },
  {
    step: 3,
    icon: <IconCloud size={28} stroke={1.6} className="text-white/75" />,
    heading: "Everything in sandboxes, managed from chat",
  },
];

export function Slide12Future() {
  return (
    <Shell className="py-14">
      <div className="grid min-h-0 flex-1 grid-cols-[532px_1fr] gap-4 pb-8">
        <div>
          <Reveal>
            <Kicker>Where this is heading</Kicker>
          </Reveal>
          <BlurWordsTitle size="lg" lines={["Manage agents,", "not tasks."]} />
          <Reveal delay={0.6}>
            <Body className="mt-5 text-lg">
              Three shifts, each already true inside Eva.
            </Body>
          </Reveal>

          <div className="mt-10 flex w-[500px] flex-col gap-4">
            {SHIFTS.map((shift) => (
              <Reveal key={shift.heading} step={shift.step} from="left">
                <div className="flex h-[84px] items-center gap-5 rounded-[20px] bg-white/[0.05] px-6">
                  <div className="shrink-0">{shift.icon}</div>
                  <div className="text-xl leading-tight font-semibold text-balance text-white">
                    {shift.heading}
                  </div>
                </div>
              </Reveal>
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
