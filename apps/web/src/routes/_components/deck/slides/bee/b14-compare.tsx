import { m } from "motion/react";
import { Shell, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BEE_SPRING } from "./_parts/BeeIsland";
import { BeeLogo } from "./_parts/BeeLogo";
import { BEE_CARD } from "./_parts/BeeBits";

interface Row {
  topic: string;
  teams: string;
  bee: string;
}

/** How each one works, not a measured accuracy test. */
const ROWS: readonly Row[] = [
  {
    topic: "Who said what",
    teams: "Worked out from the shared audio",
    bee: "Each person's own microphone",
  },
  {
    topic: "During the meeting",
    teams: "A live transcript",
    bee: "Tips from your notes and the web",
  },
  {
    topic: "Your notes",
    teams: "Stored in Microsoft 365",
    bee: "Stay on your computer",
  },
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 8, translateZ: -40 },
  { rotateX: 5, translateZ: -20 },
  { rotateX: 3 },
  { rotateX: 1, translateZ: 10, y: -6 },
];

const GRID = "grid grid-cols-[220px_1fr_1fr] items-center gap-6";

function CompareRow({ row, index }: { row: Row; index: number }) {
  const shown = useDeckStep() >= index + 1;
  return (
    <m.div
      className={`${GRID} border-t border-[#2a1e0c]/10 py-5`}
      initial={{ opacity: 0, y: 12 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={cueTransition(shown, 0.1, BEE_SPRING)}
    >
      <span className="text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase">
        {row.topic}
      </span>
      <span className="text-xl text-[#2a1e0c]/55">{row.teams}</span>
      <span className="text-xl font-medium text-[#2a1e0c]">{row.bee}</span>
    </m.div>
  );
}

export function BeeCompare() {
  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="flex w-[1088px] justify-center">
          <m.div
            className={`${BEE_CARD} w-[1000px] px-10 pt-7 pb-3`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay: 0.2 }}
          >
            {/* Column heads: the real Teams logo and Bee's mark. */}
            <div className={`${GRID} pb-5`}>
              <span />
              <span className="flex items-center gap-3 text-xl font-semibold text-[#2a1e0c]/70">
                <img
                  src="/brands/microsoft-teams.svg"
                  alt=""
                  className="size-8"
                />
                Teams transcript
              </span>
              <span className="flex items-center gap-3 text-xl font-semibold text-[#2a1e0c]">
                <BeeLogo size={40} glow={false} />
                Bee
              </span>
            </div>
            {ROWS.map((row, index) => (
              <CompareRow key={row.topic} row={row} index={index} />
            ))}
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
