import {
  IconEyeOff,
  IconHandClick,
  IconKey,
  IconScreenShare,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BeeIsland } from "./_parts/BeeIsland";
import { BeeChip } from "./_parts/BeeBits";

const SHARING = 1;
const PROMISES = 2;

const POINTS = [
  { icon: IconEyeOff, label: "No transcript on screen" },
  { icon: IconScreenShare, label: "Hidden when you share your screen" },
  { icon: IconKey, label: "Your keys stay on your computer" },
  { icon: IconHandClick, label: "Nothing joins without your click" },
];

const SHOTS: readonly CameraShot[] = [
  { rotateY: 6, translateZ: -30, x: 40 },
  { rotateY: 4, translateZ: 10, x: 40 },
  { rotateY: -3, translateZ: -20 },
];

export function BeePrivate() {
  const step = useDeckStep();
  const sharing = step >= SHARING;

  return (
    <Shell className="py-14">
      <Title size="md">Private by design</Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative flex h-[440px] w-[1088px] items-start gap-12">
          {/* Your screen as others see it while you share. */}
          <div className="relative h-[360px] w-[560px] overflow-hidden rounded-[26px] bg-[#e9e3d6] ring-1 ring-[#2a1e0c]/10">
            <div className="absolute top-4 left-1/2 -translate-x-1/2">
              <m.div
                initial={false}
                animate={
                  sharing
                    ? { opacity: 0, scale: 0.9, y: -10 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                transition={{
                  duration: DUR.slow,
                  ease: EASE.out,
                  delay: sharing ? 0.5 : 0,
                }}
              >
                <BeeIsland status="Listening…" listening width={360} />
              </m.div>
            </div>
            <div className="absolute inset-x-6 top-24 bottom-6 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((tile) => (
                <span key={tile} className="rounded-2xl bg-[#d9d1c1]" />
              ))}
            </div>
            <m.div
              className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#c0392b] px-4 py-2 text-[15px] font-semibold text-[#fff]"
              initial={{ opacity: 0, y: 10 }}
              animate={sharing ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={cueTransition(sharing, 0.15, { duration: DUR.base })}
            >
              <IconScreenShare size={16} />
              You are sharing your screen
            </m.div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {POINTS.map((point, index) => (
              <BeeChip
                key={point.label}
                icon={point.icon}
                label={point.label}
                shown={step >= PROMISES || (index === 1 && sharing)}
                delay={
                  index === 1 && step === SHARING ? 0.8 : 0.15 + index * 0.1
                }
              />
            ))}
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
