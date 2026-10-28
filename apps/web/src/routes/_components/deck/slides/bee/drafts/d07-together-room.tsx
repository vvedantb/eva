import { m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { cueTransition } from "../../../_components/motion";
import { BEE_SPRING } from "../_parts/BeeIsland";
import { BEE_CARD } from "../_parts/BeeBits";
import { BeeLogo } from "../_parts/BeeLogo";

const VOICES = 1;
const LINES = 2;

/** Three people round one table, each with Bee on their own laptop. */
const PEOPLE = [
  {
    name: "Alex",
    colour: "#e0901a",
    x: 178,
    y: 20,
    line: "They can return the forms by Friday",
  },
  {
    name: "Sam",
    colour: "#3b8ea5",
    x: 22,
    y: 178,
    line: "I will send the onboarding pack today",
  },
  {
    name: "Jo",
    colour: "#c2577a",
    x: 334,
    y: 178,
    line: "Let's start with nursing home placements",
  },
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 30, translateZ: -60 },
  { rotateX: 22, translateZ: -30 },
  { rotateX: 8 },
];

export function DraftTogetherRoom() {
  const step = useDeckStep();
  const voices = step >= VOICES;
  const lines = step >= LINES;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative flex h-[440px] w-[1088px] items-center gap-16">
          {/* The room, from above. */}
          <div className="relative h-[420px] w-[420px] shrink-0">
            <div className="absolute top-[110px] left-[110px] size-[200px] rounded-[40px] bg-[#e9e3d6] ring-1 ring-[#2a1e0c]/10" />
            {PEOPLE.map((person, index) => (
              <div
                key={person.name}
                className="absolute"
                style={{ left: person.x, top: person.y }}
              >
                {/* Each microphone hears its own person: a ripple in their colour. */}
                {[0, 1].map((ring) => (
                  <m.span
                    key={ring}
                    className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                    style={{ borderColor: person.colour }}
                    initial={{ opacity: 0 }}
                    animate={
                      voices
                        ? { opacity: [0.7, 0], scale: [1, 2.4] }
                        : { opacity: 0 }
                    }
                    transition={{
                      duration: 2,
                      repeat: voices ? Infinity : 0,
                      delay: index * 0.6 + ring,
                    }}
                  />
                ))}
                <div className="relative flex flex-col items-center gap-2">
                  <span className="flex size-16 items-center justify-center rounded-2xl bg-[#17140f]">
                    <BeeLogo
                      size={40}
                      tone="dark"
                      glow={false}
                      state={voices ? "listening" : "idle"}
                    />
                  </span>
                  <span
                    className="text-[15px] font-semibold"
                    style={{ color: person.colour }}
                  >
                    {person.name}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* One summary, every line in the colour of the voice it came from. */}
          <div className={`${BEE_CARD} flex w-[560px] flex-col gap-4 p-8`}>
            <span className="text-2xl font-semibold text-[#2a1e0c]">
              Team summary
            </span>
            {PEOPLE.map((person, index) => (
              <m.div
                key={person.name}
                className="flex items-center gap-3 text-xl text-[#2a1e0c]/85"
                initial={{ opacity: 0, x: -40 }}
                animate={lines ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
                transition={cueTransition(
                  lines,
                  0.15 + index * 0.25,
                  BEE_SPRING,
                )}
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: person.colour }}
                />
                <span
                  className="font-semibold"
                  style={{ color: person.colour }}
                >
                  {person.name}
                </span>
                {person.line}
              </m.div>
            ))}
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
