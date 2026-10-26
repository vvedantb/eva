import { IconMicrophone } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, DrawPath, cueTransition } from "../../_components/motion";
import {
  BEE,
  BEE_SPRING,
  BeeIsland,
  BeeTip,
  Waveform,
} from "./_parts/BeeIsland";
import { NoteCard } from "./_parts/BeeBits";

const HEARS = 1;
const FINDS = 2;
const TIPS = 3;

const W = 1088;
const H = 440;
const COL = { hear: 0, find: 380, tip: 720 };

/** Your notes, best match first once Bee has ranked them. Names are examples. */
const FOUND = [
  { name: "Provider call.md", best: true },
  { name: "Provider onboarding.md", best: false },
  { name: "Pricing ideas.md", best: false },
];

const SHOTS: readonly CameraShot[] = [
  { rotateY: 8, translateZ: -30, x: 120 },
  { rotateY: 5, x: 80 },
  { rotateY: 0 },
  { rotateY: -5, x: -60 },
];

function StageLabel({ text, shown }: { text: string; shown: boolean }) {
  return (
    <m.div
      className="mb-4 text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase"
      initial={{ opacity: 0 }}
      animate={{ opacity: shown ? 1 : 0.25 }}
      transition={{ duration: DUR.base }}
    >
      {text}
    </m.div>
  );
}

export function BeeListens() {
  const step = useDeckStep();
  const hears = step >= HEARS;
  const finds = step >= FINDS;
  const tips = step >= TIPS;

  return (
    <Shell className="py-14">
      <Title size="md">It listens. It finds. It tips</Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative" style={{ width: W, height: H }}>
          {/* 1 — what was said. */}
          <div className="absolute top-0" style={{ left: COL.hear }}>
            <StageLabel text="Hears" shown={hears} />
            <m.div
              className="flex w-[320px] flex-col gap-4 rounded-[26px] p-6"
              style={{ background: BEE.surface, color: BEE.text }}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: hears ? 1 : 0.3 }}
              transition={{ duration: DUR.slow }}
            >
              <div
                className="flex items-center gap-3 text-[15px]"
                style={{ color: BEE.muted }}
              >
                <IconMicrophone size={18} />
                In the meeting
                <span className="ml-auto">
                  <Waveform live={hears && !finds} />
                </span>
              </div>
              <m.p
                className="m-0 text-[22px] leading-snug font-medium"
                initial={{ opacity: 0 }}
                animate={{ opacity: hears ? 1 : 0 }}
                transition={cueTransition(hears, 0.3, { duration: DUR.slow })}
              >
                “…the provider onboarding we talked about last time…”
              </m.p>
            </m.div>
          </div>

          {/* 2 — your notes, ranked. */}
          <div className="absolute top-0" style={{ left: COL.find }}>
            <StageLabel text="Finds" shown={finds} />
            <div className="flex flex-col gap-3">
              {FOUND.map((note, index) => (
                <m.div
                  key={note.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={
                    finds
                      ? { opacity: note.best || !tips ? 1 : 0.4, x: 0 }
                      : { opacity: 0, x: -20 }
                  }
                  transition={cueTransition(
                    finds,
                    0.15 + index * 0.12,
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
          </div>

          {/* 3 — one short tip in the notch. */}
          <div className="absolute top-0" style={{ left: COL.tip }}>
            <StageLabel text="Tips" shown={tips} />
            <BeeIsland
              status={tips ? "From your notes" : "Bee"}
              state={
                tips ? "done" : finds ? "tool" : hears ? "listening" : "idle"
              }
              open={tips}
              openDelay={0.2}
              width={368}
            >
              <BeeTip shown={tips} delay={0.4}>
                Joins the AQP list if their forms are back by Friday
              </BeeTip>
            </BeeIsland>
          </div>

          {/* The thread through all three. */}
          <div className="absolute inset-0 -z-10">
            <DrawPath
              d={`M ${COL.hear + 320} 120 C ${COL.find - 20} 120, ${COL.find - 40} 110, ${COL.find - 6} 110`}
              width={W}
              height={H}
              step={FINDS}
              duration={0.6}
              dot
            />
          </div>
          <div className="absolute inset-0 -z-10">
            <DrawPath
              d={`M ${COL.find + 236} 110 C ${COL.tip - 30} 110, ${COL.tip - 40} 70, ${COL.tip - 6} 70`}
              width={W}
              height={H}
              step={TIPS}
              duration={0.6}
              dot
            />
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
