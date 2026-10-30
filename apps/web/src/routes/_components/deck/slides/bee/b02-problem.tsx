import { IconSearch } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import { CountUp } from "../../_components/CountUp";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, DrawPath, EASE, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING } from "./_parts/BeeIsland";
import { BEE_CARD, NoteCard } from "./_parts/BeeBits";

const SAID = 1;
const LOST = 2;

const W = 1088;
const H = 470;
/** Down the middle of the search bar. */
const ARROW_X = 220;

/** Your notes, scattered: the answer is in here somewhere. Names are examples. */
const NOTES = [
  { name: "Provider onboarding.md", x: 620, y: 20, r: -6 },
  { name: "Pricing ideas.md", x: 860, y: 70, r: 5 },
  { name: "1:1 notes.md", x: 700, y: 190, r: 3 },
  { name: "Q3 plan.md", x: 900, y: 240, r: -4 },
  { name: "Provider call.md", x: 640, y: 330, r: 7 },
  { name: "Ideas.md", x: 870, y: 400, r: -2 },
];

const mmss = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

const SHOTS: readonly CameraShot[] = [
  { rotateY: -6, translateZ: -20 },
  { rotateY: -3 },
  { rotateY: 4, translateZ: -30, x: -20 },
];

export function BeeProblem() {
  const step = useDeckStep();
  const lost = step >= LOST;

  return (
    <Shell className="py-14">
      <Title size="md">“We talked about this last time…”</Title>

      <Camera shots={SHOTS} className="mt-6">
        <div className="relative" style={{ width: W, height: H }}>
          {/* 1 — someone says it in the meeting. */}
          <m.div
            className="absolute top-0 left-0 max-w-[460px] rounded-[28px] rounded-bl-md px-7 py-6 text-[26px] leading-snug font-medium"
            style={{ background: BEE.surface, color: BEE.text }}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={
              step >= SAID
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 20, scale: 0.95 }
            }
            transition={cueTransition(step >= SAID, 0.1, BEE_SPRING)}
          >
            “Last time we agreed something on the provider onboarding. What was
            it?”
          </m.div>

          {/* The thread down the left: question, then search, then the clock. */}
          {[
            { from: 168, to: 214, delay: 0.1 },
            { from: 294, to: 340, delay: 1 },
          ].map((arrow) => (
            <div key={arrow.from} className="absolute inset-0 -z-10">
              <DrawPath
                d={`M ${ARROW_X} ${arrow.from} L ${ARROW_X} ${arrow.to} M ${ARROW_X - 7} ${arrow.to - 8} L ${ARROW_X} ${arrow.to} L ${ARROW_X + 7} ${arrow.to - 8}`}
                width={W}
                height={H}
                step={LOST}
                delay={arrow.delay}
                duration={0.5}
              />
            </div>
          ))}

          {/* 2 — searching by hand, mid-meeting. */}
          <m.div
            className={`${BEE_CARD} absolute top-[226px] left-0 flex h-14 w-[440px] items-center gap-3 rounded-full px-5 text-lg text-[#2a1e0c]/60`}
            initial={{ opacity: 0, y: 14 }}
            animate={lost ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
            transition={cueTransition(lost, 0.5, BEE_SPRING)}
          >
            <IconSearch size={20} />
            <m.span
              initial={false}
              animate={{ opacity: lost ? [0.4, 1, 0.4] : 0.4 }}
              transition={
                lost
                  ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                  : { duration: DUR.fast }
              }
            >
              provider… onboarding… notes…
            </m.span>
          </m.div>

          {/* 3 — the meeting clock keeps running while you search. */}
          <m.div
            className="absolute top-[352px] left-0 flex items-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={lost ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={cueTransition(lost, 1.4, BEE_SPRING)}
          >
            <span className="flex items-center gap-2 rounded-full bg-[#2a1e0c] px-4 py-2 text-[17px] font-semibold text-[#fff]">
              <span className="size-2.5 rounded-full bg-[#ff6b5a]" />
              In meeting
              <CountUp
                value={92}
                step={LOST}
                duration={5}
                delay={1.5}
                format={mmss}
                className="ml-1 text-[#fabe28] tabular-nums"
              />
            </span>
            <m.span
              className="text-[17px] font-semibold text-[#2a1e0c]/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: lost ? 1 : 0 }}
              transition={cueTransition(lost, 2.2, {
                duration: DUR.slow,
                ease: EASE.out,
              })}
            >
              …and everyone waits for you
            </m.span>
          </m.div>

          {/* The notes that hold the answer, out of reach. */}
          {NOTES.map((note, index) => (
            <m.div
              key={note.name}
              className="absolute"
              style={{ left: note.x, top: note.y }}
              initial={{ opacity: 0, rotate: 0, y: 20 }}
              animate={{
                opacity: lost ? 0.45 : 1,
                rotate: lost ? note.r * 2 : note.r,
                y: 0,
              }}
              transition={{
                duration: DUR.hero,
                ease: EASE.expo,
                delay: lost ? index * 0.05 : 0.3 + index * 0.07,
              }}
            >
              <NoteCard name={note.name} />
            </m.div>
          ))}
        </div>
      </Camera>
    </Shell>
  );
}
