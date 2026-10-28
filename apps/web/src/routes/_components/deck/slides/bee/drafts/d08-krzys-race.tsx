import { m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BeeIsland, BeeTip } from "../_parts/BeeIsland";
import { BEE_CARD, SourceChip } from "../_parts/BeeBits";

const RACE = 1;
const RESULT = 2;

/** What you type into Google, one search after another, while the meeting goes on. */
const SEARCHES = [
  "convex local deployment",
  "convex multiple local deployments",
  "convex dev two projects same machine",
  "convex local backend port",
  "convex agent mode",
  "convex self hosted multiple instances",
];

/** Seconds each search takes: type it, glance at results, clear it. */
const PER_SEARCH = 1.1;

const SHOTS: readonly CameraShot[] = [
  { rotateY: 4, translateZ: -40 },
  { rotateY: 0, translateZ: -10 },
  { rotateY: 0, translateZ: 10 },
];

export function DraftKrzysRace() {
  const step = useDeckStep();
  const race = step >= RACE;
  const result = step >= RESULT;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="flex w-[1088px] flex-col items-center gap-8">
          <div className="text-[22px] font-medium text-[#2a1e0c]/80">
            “Can Convex run more than one local deployment, so Eva can use it?”
          </div>
          <div className="flex w-full items-start justify-center gap-10">
            {/* By hand: one Google search after another. */}
            <div
              className={`${BEE_CARD} flex h-[320px] w-[480px] flex-col gap-4 p-6`}
            >
              <div className="text-sm font-semibold tracking-[0.12em] text-[#2a1e0c]/50 uppercase">
                By hand
              </div>
              <div className="relative flex h-14 items-center gap-3 rounded-full px-5 ring-1 ring-[#2a1e0c]/15">
                <img src="/brands/google.svg" alt="" className="size-6" />
                {SEARCHES.map((query, index) => {
                  const last = index === SEARCHES.length - 1;
                  return (
                    <m.span
                      key={query}
                      className="absolute left-14 overflow-hidden text-[17px] whitespace-nowrap text-[#2a1e0c]"
                      initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
                      animate={
                        race
                          ? {
                              opacity: last ? [0, 1, 1] : [0, 1, 1, 0],
                              clipPath: last
                                ? [
                                    "inset(0 100% 0 0)",
                                    "inset(0 100% 0 0)",
                                    "inset(0 0% 0 0)",
                                  ]
                                : [
                                    "inset(0 100% 0 0)",
                                    "inset(0 100% 0 0)",
                                    "inset(0 0% 0 0)",
                                    "inset(0 0% 0 0)",
                                  ],
                            }
                          : { opacity: 0, clipPath: "inset(0 100% 0 0)" }
                      }
                      transition={
                        race
                          ? {
                              duration: PER_SEARCH,
                              delay: 0.3 + index * PER_SEARCH,
                              times: last
                                ? [0, 0.05, 0.55]
                                : [0, 0.05, 0.55, 1],
                              ease: "linear",
                            }
                          : { duration: DUR.fast }
                      }
                    >
                      {query}
                    </m.span>
                  );
                })}
              </div>
              {/* Results flash up and get skimmed, each time. */}
              <m.div
                className="flex flex-col gap-3 px-2"
                initial={{ opacity: 0 }}
                animate={race ? { opacity: [0, 0, 1, 0.4] } : { opacity: 0 }}
                transition={
                  race
                    ? {
                        duration: PER_SEARCH,
                        delay: 0.3,
                        repeat: SEARCHES.length - 1,
                        times: [0, 0.55, 0.7, 1],
                      }
                    : { duration: DUR.fast }
                }
              >
                {[0.9, 0.7, 0.8, 0.6].map((width, row) => (
                  <div key={row} className="flex flex-col gap-1.5">
                    <span
                      className="h-3 rounded-full bg-[#3b6fd4]/40"
                      style={{ width: `${width * 60}%` }}
                    />
                    <span
                      className="h-2.5 rounded-full bg-[#2a1e0c]/10"
                      style={{ width: `${width * 100}%` }}
                    />
                  </div>
                ))}
              </m.div>
            </div>

            {/* With Bee: one answer, while the meeting carries on. */}
            <div className="flex w-[480px] flex-col gap-3">
              <div className="flex items-center justify-between text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase">
                With Bee
              </div>
              <BeeIsland
                status={race ? "Searched the web" : "Listening…"}
                listening={!race}
                state={race ? "done" : "listening"}
                open={race}
                openDelay={1.2}
                width={480}
              >
                <BeeTip shown={race} delay={1.5}>
                  Yes. Each copy of the project gets its own local deployment
                </BeeTip>
                <m.span
                  className="mt-3 inline-block"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: race ? 1 : 0 }}
                  transition={cueTransition(race, 1.8, { duration: DUR.base })}
                >
                  <SourceChip
                    label="docs.convex.dev"
                    domain="docs.convex.dev"
                  />
                </m.span>
              </BeeIsland>
            </div>
          </div>

          <m.div
            className="text-4xl font-semibold text-[#2a1e0c]"
            initial={{ opacity: 0, y: 12 }}
            animate={result ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={cueTransition(result, 0.2, {
              duration: DUR.hero,
              ease: EASE.expo,
            })}
          >
            Would have saved me typing and searching myself
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
