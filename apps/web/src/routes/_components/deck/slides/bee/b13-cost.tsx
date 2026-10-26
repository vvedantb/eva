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
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { CountUp } from "../../_components/CountUp";
import { DUR, EASE, Spotlight, cueTransition } from "../../_components/motion";
import { BEE_CARD, BeeChip } from "./_parts/BeeBits";

const BUDGET = 1;
const COVERS = 2;

/** The three AI jobs Bee does in a meeting, as the listens slide shows them. */
const JOBS = [
  { icon: IconMicrophone, label: "Turning speech into text" },
  { icon: IconListSearch, label: "Finding the right note" },
  { icon: IconSparkles, label: "Writing the tip" },
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -40 },
  { rotateX: 2, translateZ: 10 },
  { rotateY: -4, translateZ: -20, x: -30 },
];

const GLOW = [
  { x: 300, y: 200, size: 360 },
  { x: 300, y: 200, size: 520 },
  { x: 544, y: 220, size: 640 },
];

export function BeeCost() {
  const step = useDeckStep();
  const covers = step >= COVERS;

  return (
    <Shell className="py-14">
      <Title size="md">
        Already <Accent>paid for</Accent>
      </Title>

      <Camera shots={SHOTS} className="mt-10">
        <div className="relative isolate flex h-[420px] w-[1088px] items-center justify-center gap-16">
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />

          {/* The monthly allowance, counted up. */}
          <m.div
            className={`${BEE_CARD} flex w-[580px] flex-col gap-3 px-10 py-9`}
            initial={{ opacity: 0, y: 16 }}
            animate={
              step >= BUDGET ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }
            }
            transition={cueTransition(step >= BUDGET, 0.1, {
              duration: DUR.slow,
              ease: EASE.out,
            })}
          >
            <span className="text-[96px] leading-none font-semibold tracking-[-0.03em] text-[#2a1e0c]">
              <CountUp value={500} prefix="$" step={BUDGET} delay={0.25} />
            </span>
            <span className="text-2xl text-[#2a1e0c]/70">
              of AI use every month, free on our Teams plan
            </span>
          </m.div>

          {/* What it pays for, and the point of it. */}
          <div className="flex flex-col gap-3">
            <m.div
              className="mb-1 text-sm font-semibold tracking-[0.12em] text-[#a15f00] uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: covers ? 1 : 0 }}
              transition={cueTransition(covers, 0, { duration: DUR.base })}
            >
              Meant for projects like this
            </m.div>
            {JOBS.map((job, index) => (
              <BeeChip
                key={job.label}
                icon={job.icon}
                label={job.label}
                shown={covers}
                delay={0.15 + index * 0.12}
              />
            ))}
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
