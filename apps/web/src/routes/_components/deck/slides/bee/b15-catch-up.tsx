import { IconChecklist, IconListCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING } from "./_parts/BeeIsland";
import { ACTION_ITEMS, BEE_CARD, DECIDED, SourceChip } from "./_parts/BeeBits";

const FORWARDED = 1;
const DECISIONS = 2;
const ACTIONS = 3;

const SHOTS: readonly CameraShot[] = [
  { rotateY: 8, translateZ: -40, x: 60 },
  { rotateY: 5, translateZ: -10, x: 40 },
  { rotateY: 0 },
  { rotateY: -4, translateZ: 10, x: -20 },
];

export function BeeCatchUp() {
  const step = useDeckStep();
  const forwarded = step >= FORWARDED;
  const decisions = step >= DECISIONS;
  const actions = step >= ACTIONS;

  return (
    <Shell className="py-14">
      <Title size="md">
        Missed it? <Accent>Catch up in a minute</Accent>
      </Title>

      <Camera shots={SHOTS} className="mt-10">
        <div className="flex w-[1088px] items-start justify-center gap-12">
          {/* A colleague forwards the summary their Bee saved. */}
          <m.div
            className="flex w-[400px] flex-col gap-3 rounded-[24px] rounded-bl-md p-6"
            style={{ background: BEE.surface, color: BEE.text }}
            initial={{ opacity: 0, x: -20 }}
            animate={forwarded ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={cueTransition(forwarded, 0.1, BEE_SPRING)}
          >
            <span className="text-[15px]" style={{ color: BEE.muted }}>
              Sam
            </span>
            <span className="text-[21px] leading-snug font-medium">
              You missed the provider call, here is the summary
            </span>
            <span className="self-start">
              <SourceChip label="Provider onboarding summary.md" />
            </span>
          </m.div>

          {/* What you get from it: decisions, then who does what. */}
          <div className={`${BEE_CARD} flex w-[560px] flex-col gap-6 p-8`}>
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={decisions ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={cueTransition(decisions, 0.1, BEE_SPRING)}
            >
              <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-[0.1em] text-[#a15f00] uppercase">
                <IconChecklist size={18} />
                What was decided
              </div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {DECIDED.map((line) => (
                  <li
                    key={line}
                    className="flex gap-3 text-xl text-[#2a1e0c]/85"
                  >
                    <span className="mt-2.5 size-2 shrink-0 rounded-full bg-[#f2a516]" />
                    {line}
                  </li>
                ))}
              </ul>
            </m.div>

            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={actions ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={cueTransition(actions, 0.1, {
                duration: DUR.slow,
                ease: EASE.out,
              })}
            >
              <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-[0.1em] text-[#a15f00] uppercase">
                <IconListCheck size={18} />
                Who does what
              </div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {ACTION_ITEMS.map((item) => (
                  <li
                    key={item.text}
                    className="flex items-center gap-3 text-xl text-[#2a1e0c]/85"
                  >
                    <span className="size-5 shrink-0 rounded-md ring-2 ring-[#2a1e0c]/25" />
                    <span className="flex-1">{item.text}</span>
                    <span className="rounded-full bg-[#fabe28]/30 px-3 py-0.5 text-[15px] font-semibold text-[#7a4800]">
                      {item.owner}
                    </span>
                  </li>
                ))}
              </ul>
            </m.div>
          </div>
        </div>
      </Camera>
    </Shell>
  );
}
