import { IconSearch, IconFileText } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { CountUp } from "../../../_components/CountUp";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BEE, BEE_SPRING } from "../_parts/BeeIsland";

const SEARCH = 1;
const CLOCK = 2;

/** Your own files, the wrong ones first. Names are examples. */
const RESULTS = [
  "Pricing ideas.md",
  "1:1 notes.md",
  "Q3 plan.md",
  "Ideas.md",
  "Provider onboarding.md",
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 8, translateZ: -40 },
  { rotateX: 4, translateZ: -10 },
  // In close on the meeting clock while you are still searching.
  { rotateX: 0, scale: 1.9, x: -560, y: 300 },
];

const mmss = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export function DraftProblemClock() {
  const step = useDeckStep();
  const searching = step >= SEARCH;
  const clock = step >= CLOCK;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative mx-auto h-[480px] w-[1000px] overflow-hidden rounded-[26px] bg-[#e9e3d6] ring-1 ring-[#2a1e0c]/10">
          {/* Someone asks the question in the call. */}
          <div
            className="absolute top-6 left-6 flex w-[420px] flex-col gap-2 rounded-2xl rounded-bl-md p-5"
            style={{ background: BEE.surface, color: BEE.text }}
          >
            <span className="text-[14px]" style={{ color: BEE.muted }}>
              Alex, in the meeting
            </span>
            <span className="text-[19px] leading-snug font-medium">
              “Last time we agreed something on the provider onboarding. What
              was it?”
            </span>
          </div>

          {/* The meeting clock, still running. */}
          <div className="absolute top-6 right-6 flex items-center gap-2 rounded-full bg-[#2a1e0c] px-4 py-2 text-[17px] font-semibold text-[#fff]">
            <span className="size-2.5 rounded-full bg-[#ff6b5a]" />
            In meeting
            <CountUp
              value={92}
              step={SEARCH}
              duration={6}
              delay={0.2}
              format={mmss}
              className="ml-1 text-[#fabe28]"
            />
          </div>

          {/* You, searching your own files by hand. */}
          <m.div
            className="absolute bottom-6 left-6 w-[560px] rounded-2xl bg-[#fffdf8] p-5 shadow-xl shadow-black/10"
            initial={{ opacity: 0, y: 24 }}
            animate={searching ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={cueTransition(searching, 0.1, BEE_SPRING)}
          >
            <div className="flex items-center gap-3 rounded-xl bg-[#2a1e0c]/[0.06] px-4 py-3 text-lg text-[#2a1e0c]">
              <IconSearch size={20} className="text-[#2a1e0c]/50" />
              <m.span
                className="overflow-hidden whitespace-nowrap"
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                animate={{
                  clipPath: searching ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
                }}
                transition={{ duration: 1.6, ease: "linear", delay: 0.4 }}
              >
                provider… onboarding… notes…
              </m.span>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {RESULTS.map((name, index) => (
                <m.div
                  key={name}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-[17px] text-[#2a1e0c]/70"
                  initial={{ opacity: 0, x: -10 }}
                  animate={
                    searching
                      ? { opacity: [0, 1, 1, 0.35], x: 0 }
                      : { opacity: 0, x: -10 }
                  }
                  transition={
                    searching
                      ? {
                          duration: 2.4,
                          delay: 1.6 + index * 0.35,
                          times: [0, 0.15, 0.7, 1],
                        }
                      : { duration: DUR.fast }
                  }
                >
                  <IconFileText size={18} className="text-[#c27406]" />
                  {name}
                </m.div>
              ))}
            </div>
          </m.div>

          {/* The cost of it, said in the close-up. */}
          <m.div
            className="absolute top-20 right-6 text-right text-[15px] font-semibold text-[#2a1e0c]/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: clock ? 1 : 0 }}
            transition={cueTransition(clock, 1.2, {
              duration: DUR.slow,
              ease: EASE.out,
            })}
          >
            …and the meeting moves on
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
