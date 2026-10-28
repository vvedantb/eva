import {
  IconListSearch,
  IconMicrophone,
  IconSparkles,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../../_components/DeckPrimitives";
import { Camera } from "../../../_components/DeckCamera";
import type { CameraShot } from "../../../_components/DeckCamera";
import { CountUp } from "../../../_components/CountUp";
import { cueTransition } from "../../../_components/motion";
import { BeeChip } from "../_parts/BeeBits";

const FILL = 1;
const SIPS = 2;

const JOBS = [
  { icon: IconMicrophone, label: "Turning speech into text" },
  { icon: IconListSearch, label: "Finding the right note" },
  { icon: IconSparkles, label: "Writing the tip" },
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -40 },
  { rotateX: 2, translateZ: 10 },
  { rotateY: -4, translateZ: -10, x: -20 },
];

/** Jar interior, in the svg's own units. */
const JAR = { top: 70, bottom: 300 };

export function DraftCostJar() {
  const step = useDeckStep();
  const fill = step >= FILL;
  const sips = step >= SIPS;
  // Full to the brim, then a little lower once Bee has used some.
  const level = sips ? 0.86 : fill ? 1 : 0;
  const height = (JAR.bottom - JAR.top) * level;

  return (
    <Shell className="py-14">
      <Title size="md">
        Already <Accent>paid for</Accent>
      </Title>
      <Camera shots={SHOTS} className="mt-6">
        <div className="flex w-[1088px] items-center justify-center gap-20">
          {/* A honey jar that fills to $500. */}
          <div className="relative">
            <svg width="260" height="330" viewBox="0 0 260 330" aria-hidden>
              <defs>
                <clipPath id="draft-jar">
                  <path d="M60 60 H200 Q230 60 230 100 V280 Q230 310 200 310 H60 Q30 310 30 280 V100 Q30 60 60 60 Z" />
                </clipPath>
                <linearGradient id="draft-honey" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffd75e" />
                  <stop offset="1" stopColor="#e09a12" />
                </linearGradient>
              </defs>
              <rect
                x="70"
                y="30"
                width="120"
                height="30"
                rx="8"
                fill="#2a1e0c"
              />
              <g clipPath="url(#draft-jar)">
                <rect x="0" y="0" width="260" height="330" fill="#fffdf8" />
                <m.rect
                  x="0"
                  width="260"
                  fill="url(#draft-honey)"
                  initial={{ y: 310, height: 0 }}
                  animate={{ y: 310 - height, height }}
                  transition={{
                    duration: fill && !sips ? 2.2 : 1.2,
                    ease: [0.22, 1, 0.36, 1],
                    delay: fill && !sips ? 0.3 : 0.4,
                  }}
                />
              </g>
              <path
                d="M60 60 H200 Q230 60 230 100 V280 Q230 310 200 310 H60 Q30 310 30 280 V100 Q30 60 60 60 Z"
                fill="none"
                stroke="#2a1e0c"
                strokeOpacity="0.25"
                strokeWidth="3"
              />
            </svg>
            <div className="absolute inset-x-0 top-[150px] text-center text-6xl font-semibold tracking-[-0.03em] text-[#2a1e0c]">
              <CountUp
                value={500}
                prefix="$"
                step={FILL}
                duration={2.2}
                delay={0.3}
              />
            </div>
            <div className="mt-3 text-center text-xl text-[#2a1e0c]/70">
              a month, free on our Teams plan
            </div>
          </div>

          {/* What it pays for: small sips, not the whole jar. */}
          <div className="flex flex-col gap-3">
            <m.div
              className="mb-1 text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: sips ? 1 : 0 }}
              transition={cueTransition(sips, 0, { duration: 0.3 })}
            >
              Meant for projects like this
            </m.div>
            {JOBS.map((job, index) => (
              <BeeChip
                key={job.label}
                icon={job.icon}
                label={job.label}
                shown={sips}
                delay={0.2 + index * 0.15}
              />
            ))}
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
