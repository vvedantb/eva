import { IconMicrophone } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, DrawPath, EASE, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING, BeeIsland, BeeTip } from "./_parts/BeeIsland";
import { NoteCard, SourceChip } from "./_parts/BeeBits";

const HEARS = 1;
const FINDS = 2;
const TIPS = 3;

const W = 1088;
const H = 460;

/** Middle of the matching note, where the thread lands. */
const NOTE_Y = 266;

const NOTES = [
  { name: "Pricing ideas.md", best: false },
  { name: "Provider call.md", best: true },
  { name: "Provider onboarding.md", best: false },
];

// The camera follows the phrase: left, then middle, then right.
const SHOTS: readonly CameraShot[] = [
  { rotateY: 8, x: 320, translateZ: -40 },
  { rotateY: 6, x: 300, scale: 1.15 },
  { rotateY: 0, x: 0, scale: 1.1 },
  // Pull back at the end, so the question, the note and the tip are all in view.
  { rotateY: -4, x: 0, scale: 1 },
];

export function BeeListens() {
  const step = useDeckStep();
  const finds = step >= FINDS;
  const tips = step >= TIPS;
  const hears = step >= HEARS;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative" style={{ width: W, height: H }}>
          {/* The three stages, named as on the original slide. */}
          {[
            { text: "Hears", left: 0, on: step >= HEARS },
            { text: "Finds", left: 400, on: finds },
            { text: "Tips", left: 740, on: tips },
          ].map((stage) => (
            <m.div
              key={stage.text}
              className="absolute top-[100px] text-sm font-semibold tracking-[0.14em] text-[#a15f00] uppercase"
              style={{ left: stage.left }}
              initial={{ opacity: 0, y: 6 }}
              animate={stage.on ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={cueTransition(stage.on, 0.1, BEE_SPRING)}
            >
              {stage.text}
            </m.div>
          ))}

          {/* A speaker in the call. */}
          <div className="absolute top-[180px] left-0 flex flex-col items-center gap-3">
            <span className="flex size-24 items-center justify-center rounded-full bg-[#d9d1c1] text-3xl font-semibold text-[#2a1e0c]/60">
              A
            </span>
            <span className="text-[15px] text-[#2a1e0c]/60">
              Alex is talking
            </span>
            {/* Sound leaving the speaker. */}
            {[0, 1, 2].map((ring) => (
              <m.span
                key={ring}
                className="absolute top-0 left-1/2 size-24 -translate-x-1/2 rounded-full border-2 border-[#fabe28]"
                initial={{ opacity: 0, scale: 1 }}
                animate={
                  hears
                    ? { opacity: [0.6, 0], scale: [1, 2.2] }
                    : { opacity: 0 }
                }
                transition={{
                  duration: 1.8,
                  repeat: step >= HEARS && !finds ? Infinity : 0,
                  delay: ring * 0.5,
                }}
              />
            ))}
          </div>

          {/* What was heard: stays under the speaker for the whole slide. */}
          <m.div
            className="absolute top-[330px] left-0 z-10 flex w-[300px] flex-col gap-1 rounded-2xl rounded-tl-md px-4 py-3 text-[18px] leading-snug font-medium shadow-lg shadow-black/10"
            style={{ background: BEE.surface, color: BEE.text }}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={
              hears
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 10, scale: 0.9 }
            }
            transition={{ ...BEE_SPRING, duration: 0.8 }}
          >
            <span
              className="flex items-center gap-2 text-[14px] font-normal"
              style={{ color: BEE.muted }}
            >
              <IconMicrophone size={16} style={{ color: BEE.accent }} />
              In the meeting
            </span>
            “…the provider onboarding we talked about last time…”
          </m.div>

          {/* The thread through all three, as on the slide before. */}
          <div className="absolute inset-0 -z-10">
            <DrawPath
              d={`M 306 372 C 360 372, 350 ${NOTE_Y}, 394 ${NOTE_Y}`}
              width={W}
              height={H}
              step={FINDS}
              duration={0.6}
              dot
            />
          </div>
          <div className="absolute inset-0 -z-10">
            <DrawPath
              d={`M 666 ${NOTE_Y} C 700 ${NOTE_Y}, 700 180, 734 180`}
              width={W}
              height={H}
              step={TIPS}
              duration={0.6}
              dot
            />
          </div>

          {/* Your notes; the right one lights up as the phrase lands. */}
          <div className="absolute top-[150px] left-[400px] flex w-[260px] flex-col gap-3">
            {NOTES.map((note, index) => (
              <m.div
                key={note.name}
                initial={{ opacity: 0, y: 12 }}
                animate={
                  step >= HEARS
                    ? {
                        opacity: finds && !note.best ? 0.4 : 1,
                        y: 0,
                        scale: finds && note.best ? 1.06 : 1,
                      }
                    : { opacity: 0, y: 12 }
                }
                transition={cueTransition(
                  step >= HEARS,
                  finds ? 0.7 : 0.3 + index * 0.1,
                  BEE_SPRING,
                )}
              >
                <NoteCard
                  name={note.name}
                  lines={2}
                  match={finds && note.best}
                />
              </m.div>
            ))}
          </div>

          {/* The tip, in the bar. */}
          <div className="absolute top-[150px] left-[740px]">
            <m.div
              initial={{ opacity: 0, x: -20 }}
              animate={tips ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={cueTransition(tips, 0.2, {
                duration: DUR.slow,
                ease: EASE.out,
              })}
            >
              <BeeIsland
                status="From your notes"
                state={tips ? "done" : "tool"}
                open={tips}
                openDelay={0.3}
                width={340}
              >
                <BeeTip shown={tips} delay={0.5}>
                  Joins the AQP list if their forms are back by Friday
                </BeeTip>
                {/* Where the tip came from, as Bee shows it. */}
                <m.span
                  className="mt-4 inline-block"
                  initial={{ opacity: 0, y: 6 }}
                  animate={tips ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                  transition={cueTransition(tips, 0.8, BEE_SPRING)}
                >
                  <SourceChip label="Provider call.md" />
                </m.span>
              </BeeIsland>
            </m.div>
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
