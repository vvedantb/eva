import type { ReactNode } from "react";
import { IconArrowBackUp, IconCloud, IconRobot } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  Body,
  Card,
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
  line: string;
}

const SHIFTS: Shift[] = [
  {
    step: 1,
    icon: <IconRobot size={24} className="text-white/70" />,
    heading: "More automations",
    line: "Routine work runs on a schedule or a trigger. People set direction, not tasks.",
  },
  {
    step: 2,
    icon: <IconArrowBackUp size={24} className="text-white/70" />,
    heading: "Mistakes become cheap",
    line: "When any change can be remade in minutes, being wrong stops being expensive. Try more, worry less.",
  },
  {
    step: 3,
    icon: <IconCloud size={24} className="text-white/70" />,
    heading: "Everything in sandboxes, managed from chat",
    line: "Eva's own development already lives this way. The Grok bot merges its changes. Next, the same for all our work.",
  },
];

export function Slide12Future() {
  return (
    <Shell className="py-14">
      <div className="grid grid-cols-[532px_1fr] items-start gap-4">
        <div>
          <Reveal>
            <Kicker>Where this is heading</Kicker>
          </Reveal>
          <BlurWordsTitle size="lg" lines={["Manage agents,", "not tasks."]} />
          <Reveal delay={0.6}>
            <Body className="mt-5 text-lg">
              Three shifts we expect, based on what has already happened inside
              Eva.
            </Body>
          </Reveal>

          <div className="mt-8 flex w-[520px] flex-col gap-[14px]">
            {SHIFTS.map((shift) => (
              <Reveal key={shift.heading} step={shift.step}>
                <Card className="flex h-[92px] items-center gap-4 px-5 py-4">
                  <div className="shrink-0">{shift.icon}</div>
                  <div>
                    <div className="text-lg leading-tight font-semibold text-white">
                      {shift.heading}
                    </div>
                    <div className="mt-1 text-sm leading-snug text-white/60">
                      {shift.line}
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>

        <Camera
          shots={FLEET_SHOTS}
          className="flex h-full items-center justify-center"
        >
          <AgentFleet />
        </Camera>
      </div>

      <Footnote>
        A direction of travel, not a plan. Everything on this slide is already
        true for how Eva itself is built.
      </Footnote>
    </Shell>
  );
}
