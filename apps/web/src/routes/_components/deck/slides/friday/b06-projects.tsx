import { m } from "motion/react";
import { cn } from "@eva/ui";
import { Camera } from "../../_components/DeckCamera";
import {
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { SETTLE } from "../../_components/motion";
import { FriWindow } from "../_parts/FriMock";
import {
  MoF2Axis,
  MoF2RoadmapRow,
  MoF2Today,
  MOF2_LABEL,
} from "../_parts/MoF2Roadmap";
import type { MoF2Bar } from "../_parts/MoF2Roadmap";

/** Four jobs, top to bottom, in the order they run. */
const BARS: readonly MoF2Bar[] = [
  {
    label: "Referral portal",
    month: { offset: 0, width: 300 },
    week: { offset: 0, width: 540 },
    done: 1,
  },
  {
    label: "Exports",
    month: { offset: 70, width: 330 },
    week: { offset: 130, width: 600 },
    done: 0.72,
  },
  {
    label: "Admin pages",
    month: { offset: 190, width: 360 },
    week: { offset: 350, width: 650 },
    done: 0.45,
  },
  {
    label: "Decline emails",
    month: { offset: 330, width: 300 },
    week: { offset: 610, width: 540 },
    done: 0.18,
  },
];

const ZOOMS: readonly string[] = ["Quarter", "Month", "Week"];

/** The zoom is the step-2 move; the camera leans in with it. */
const SHOTS = [{}, {}, { translateZ: 28, y: -4 }];

function ZoomSwitch() {
  const active = useDeckStep() >= 2 ? "Week" : "Month";

  return (
    <div className="flex items-center gap-1 rounded-[12px] bg-white/[0.05] p-1">
      {ZOOMS.map((zoom) => (
        <span key={zoom} className="relative px-2.5 py-1">
          {zoom === active ? (
            <m.span
              layoutId="fri-zoom-active"
              className="absolute inset-0 rounded-[8px] bg-white/[0.14] ring-1 ring-white/10"
              transition={SETTLE}
            />
          ) : null}
          <span
            className={cn(
              "relative text-[11px] transition-colors duration-300",
              zoom === active ? "text-white" : "text-white/40",
            )}
          >
            {zoom}
          </span>
        </span>
      ))}
    </div>
  );
}

export function FridayProjects() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Title size="md">See the whole job at once.</Title>
      </Reveal>

      <div className="flex flex-1 flex-col justify-center pb-8">
        <Camera shots={SHOTS}>
          <Reveal delay={0.2} distance={28}>
            <FriWindow
              label="Referral portal"
              className="h-[372px] w-full"
              bodyClassName="relative flex flex-col gap-3 px-6 pt-5 pb-5"
              trailing={<ZoomSwitch />}
            >
              <MoF2Axis />
              <MoF2Today />
              <div
                className="h-4 shrink-0"
                style={{ marginLeft: MOF2_LABEL }}
              />
              {BARS.map((bar, index) => (
                <MoF2RoadmapRow key={bar.label} bar={bar} index={index} />
              ))}
            </FriWindow>
          </Reveal>
        </Camera>
      </div>
    </Shell>
  );
}
