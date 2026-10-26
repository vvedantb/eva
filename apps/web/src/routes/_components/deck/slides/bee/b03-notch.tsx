import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE } from "../../_components/motion";
import { BEE, BeeIsland, BeeTip } from "./_parts/BeeIsland";

const LISTEN = 1;
const ANSWER = 2;

/** Meeting tiles under the notch: a call in progress, people as initials. */
const TILES = ["A", "S", "J", "M", "R", "K"];

/** Wide on the call, then in close on the notch as it starts listening, then back a little for the answer. */
const SHOTS: readonly CameraShot[] = [
  { rotateX: 10, translateZ: -40 },
  { rotateX: 0, scale: 1.9, y: 330 },
  { rotateX: 2, scale: 1.3, y: 150 },
];

export function BeeNotch() {
  const step = useDeckStep();
  const listening = step >= LISTEN;
  const open = step >= ANSWER;

  return (
    <Shell className="py-14">
      <Title size="md">A small bar at the top of your screen</Title>

      <Camera shots={SHOTS} className="mt-6">
        {/* Your screen, mid-call. */}
        <div className="relative mx-auto h-[450px] w-[900px] overflow-hidden rounded-[26px] bg-[#e9e3d6] ring-1 ring-[#2a1e0c]/10">
          <div className="grid h-full grid-cols-3 gap-3 p-5 pt-20">
            {TILES.map((tile, index) => (
              <m.div
                key={tile}
                className="flex items-center justify-center rounded-2xl bg-[#d9d1c1]"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: open ? 0.55 : 1, scale: 1 }}
                transition={{
                  duration: DUR.slow,
                  ease: EASE.out,
                  delay: open ? 0 : 0.2 + index * 0.05,
                }}
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-[#fffaf0] text-xl font-semibold text-[#2a1e0c]/60">
                  {tile}
                </span>
              </m.div>
            ))}
          </div>

          {/* The notch, top centre, over everything. */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <BeeIsland
              status={
                open ? "Found in your notes" : listening ? "Listening…" : "Bee"
              }
              listening={listening && !open}
              state={open ? "done" : listening ? "listening" : "idle"}
              open={open}
              openDelay={0.15}
            >
              <div className="flex flex-col gap-3">
                <BeeTip shown={open} delay={0.35}>
                  Last time you agreed a 12-month renewal, if Acme signs by
                  Friday.
                </BeeTip>
                <m.p
                  className="m-0 text-[15px]"
                  style={{ color: BEE.muted }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: open ? 1 : 0 }}
                  transition={{ duration: DUR.base, delay: open ? 0.6 : 0 }}
                >
                  From Call with Acme.md
                </m.p>
              </div>
            </BeeIsland>
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
