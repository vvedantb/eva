import { IconBrandChrome, IconClockHour4 } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, useDeckStep } from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { CountUp } from "../../../_components/CountUp";
import { DUR, EASE, cueTransition } from "../../../_components/motion";
import { BEE_SPRING, BeeIsland, BeeTip } from "../_parts/BeeIsland";
import { BEE_CARD, SourceChip } from "../_parts/BeeBits";

const RACE = 1;
const RESULT = 2;

/** The tabs you open looking for the answer yourself. */
const TABS = [
  "convex local deployment",
  "convex docs: dev",
  "multiple deployments?",
  "github issue #…",
  "convex agent mode",
  "stack overflow",
];

const mmss = (n: number) =>
  `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

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
            {/* By hand: tabs pile up while the clock runs. */}
            <div
              className={`${BEE_CARD} flex h-[320px] w-[480px] flex-col gap-3 p-6`}
            >
              <div className="flex items-center justify-between text-sm font-semibold tracking-[0.12em] text-[#2a1e0c]/50 uppercase">
                By hand
                <span className="flex items-center gap-1.5 text-xl tracking-normal text-[#2a1e0c]">
                  <IconClockHour4 size={20} />
                  <CountUp
                    value={312}
                    step={RACE}
                    duration={5}
                    delay={0.3}
                    format={mmss}
                  />
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TABS.map((tab, index) => (
                  <m.span
                    key={tab}
                    className="flex items-center gap-2 rounded-lg bg-[#2a1e0c]/[0.06] px-3 py-1.5 text-[15px] text-[#2a1e0c]/70"
                    initial={{ opacity: 0, y: 8 }}
                    animate={race ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                    transition={cueTransition(
                      race,
                      0.4 + index * 0.7,
                      BEE_SPRING,
                    )}
                  >
                    <IconBrandChrome size={15} />
                    {tab}
                  </m.span>
                ))}
              </div>
            </div>

            {/* With Bee: one answer, while the meeting carries on. */}
            <div className="flex w-[480px] flex-col gap-3">
              <div className="flex items-center justify-between text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase">
                With Bee
                <span className="text-xl tracking-normal text-[#2a1e0c]">
                  <CountUp
                    value={4}
                    step={RACE}
                    duration={1.2}
                    delay={0.3}
                    format={mmss}
                  />
                </span>
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
            Would have saved 5+ minutes
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
