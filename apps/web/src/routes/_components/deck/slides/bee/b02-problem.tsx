import { IconSearch } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING } from "./_parts/BeeIsland";
import { BEE_CARD, NoteCard } from "./_parts/BeeBits";

const SAID = 1;
const LOST = 2;

/** Your notes, scattered: the answer is in here somewhere. Names are examples. */
const NOTES = [
  { name: "Provider onboarding.md", x: 620, y: 20, r: -6 },
  { name: "Pricing ideas.md", x: 860, y: 70, r: 5 },
  { name: "1:1 notes.md", x: 700, y: 190, r: 3 },
  { name: "Q3 plan.md", x: 900, y: 240, r: -4 },
  { name: "Provider call.md", x: 640, y: 330, r: 7 },
  { name: "Ideas.md", x: 870, y: 400, r: -2 },
];

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
        <div className="relative h-[470px] w-[1088px]">
          {/* Someone says it in the meeting. */}
          <m.div
            className="absolute top-[120px] left-0 max-w-[460px] rounded-[28px] rounded-bl-md px-7 py-6 text-[26px] leading-snug font-medium"
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

          {/* Searching by hand, mid-meeting. */}
          <m.div
            className={`${BEE_CARD} absolute top-[400px] left-0 flex h-14 w-[440px] items-center gap-3 rounded-full px-5 text-lg text-[#2a1e0c]/60`}
            initial={{ opacity: 0, y: 14 }}
            animate={lost ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
            transition={cueTransition(lost, 0.3, BEE_SPRING)}
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
        </div>
      </Camera>
    </Shell>
  );
}
