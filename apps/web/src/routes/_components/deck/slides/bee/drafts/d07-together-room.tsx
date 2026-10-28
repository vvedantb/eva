import { IconMicrophone } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { DUR, cueTransition } from "../../../_components/motion";
import { BEE_SPRING } from "../_parts/BeeIsland";
import { BEE_CARD } from "../_parts/BeeBits";
import { BeeLogo } from "../_parts/BeeLogo";

interface Person {
  name: string;
  colour: string;
  /** Seat round the table, in the room's own pixels. */
  x: number;
  y: number;
  line: string;
  /** The build step on which this person speaks. */
  speaks: number;
}

/** Three people round one table, each with Bee on their own laptop. In speaking order. */
const PEOPLE: readonly Person[] = [
  {
    name: "Alex",
    colour: "#e0901a",
    x: 178,
    y: 20,
    line: "They can return the forms by Friday",
    speaks: 1,
  },
  {
    name: "Jo",
    colour: "#c2577a",
    x: 334,
    y: 178,
    line: "Let's start with nursing home placements",
    speaks: 2,
  },
  {
    name: "Sam",
    colour: "#3b8ea5",
    x: 22,
    y: 178,
    line: "I will send the onboarding pack today",
    speaks: 3,
  },
];

const EXPLAIN = 4;

const SHOTS: readonly CameraShot[] = [
  { rotateX: 26, translateZ: -50 },
  { rotateX: 18, translateZ: -30 },
  { rotateX: 12, translateZ: -20 },
  { rotateX: 8, translateZ: -10 },
  { rotateX: 4 },
];

/** Sound leaving the speaker: two rings, mounted only while they talk, so the loop never restarts mid-way. */
function Ripples({ colour }: { colour: string }) {
  return (
    <>
      {[0, 1].map((ring) => (
        <m.span
          key={ring}
          className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ borderColor: colour }}
          initial={{ opacity: 0.7, scale: 1 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeOut",
            delay: ring * 0.8,
          }}
        />
      ))}
    </>
  );
}

export function DraftTogetherRoom() {
  const step = useDeckStep();
  const explain = step >= EXPLAIN;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative flex h-[440px] w-[1088px] items-center gap-16">
          {/* The room, from above. */}
          <div className="relative h-[420px] w-[420px] shrink-0">
            <div className="absolute top-[110px] left-[110px] size-[200px] rounded-[40px] bg-[#e9e3d6] ring-1 ring-[#2a1e0c]/10" />
            {PEOPLE.map((person) => {
              const speaking = step === person.speaks;
              return (
                <div
                  key={person.name}
                  className="absolute"
                  style={{ left: person.x, top: person.y }}
                >
                  {speaking ? <Ripples colour={person.colour} /> : null}
                  <div className="relative flex flex-col items-center gap-2">
                    <span className="flex size-16 items-center justify-center rounded-2xl bg-[#17140f]">
                      <BeeLogo
                        size={40}
                        tone="dark"
                        glow={false}
                        state={speaking ? "listening" : "idle"}
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
              );
            })}
            {/* What it takes: Bee running on everyone's laptop. */}
            <m.div
              className="absolute bottom-0 left-0 w-full text-center text-[17px] text-[#2a1e0c]/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DUR.slow, delay: 0.8 }}
            >
              Everyone runs Bee on their own laptop
            </m.div>
          </div>

          {/* One summary, written live: each line as its speaker says it, in their colour. */}
          <div className={`${BEE_CARD} flex w-[560px] flex-col gap-4 p-8`}>
            <span className="text-2xl font-semibold text-[#2a1e0c]">
              Team summary
            </span>
            {PEOPLE.map((person) => {
              const said = step >= person.speaks;
              return (
                <div
                  key={person.name}
                  className="flex min-h-[30px] items-center gap-3 text-xl text-[#2a1e0c]/85"
                >
                  <m.span
                    className="flex items-center gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: said ? 1 : 0 }}
                    transition={{ duration: DUR.base }}
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
                  </m.span>
                  {/* Typed out as it is heard. */}
                  <m.span
                    className="whitespace-nowrap"
                    initial={{ clipPath: "inset(0 100% 0 0)" }}
                    animate={{
                      clipPath: said ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
                    }}
                    transition={
                      said
                        ? { duration: 1.4, ease: "linear", delay: 0.3 }
                        : { duration: DUR.fast }
                    }
                  >
                    {person.line}
                  </m.span>
                </div>
              );
            })}
            <m.div
              className="mt-2 flex items-center gap-3 text-[19px] font-semibold text-[#2a1e0c]"
              initial={{ opacity: 0, y: 10 }}
              animate={explain ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={cueTransition(explain, 0.2, BEE_SPRING)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fabe28]/30 text-[#7a4800]">
                <IconMicrophone size={18} />
              </span>
              Each line comes from that person&apos;s own microphone, so it is
              never a guess
            </m.div>
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
