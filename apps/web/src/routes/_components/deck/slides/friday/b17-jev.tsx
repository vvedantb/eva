import type { Icon } from "@tabler/icons-react";
import {
  IconAt,
  IconFileCheck,
  IconFilter,
  IconFlag,
  IconListCheck,
  IconSparkles,
  IconTag,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Footnote,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera, Layer } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  DrawPath,
  EASE,
  GridBackdrop,
  Pulse,
  Sheen,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import { FRI3_JEV_QUESTIONS, Fri3JevAnswers } from "../_parts/Fri3JevAnswers";
import { Fri2Chip } from "../_parts/Fri2Chip";

interface Use {
  icon: Icon;
  label: string;
}

/** Every place Eva asks Jev today, in the order they shipped. */
const USES: readonly Use[] = [
  { icon: IconTag, label: "Tags tasks" },
  { icon: IconFilter, label: "Sorts findings" },
  { icon: IconFileCheck, label: "Checks drafts" },
  { icon: IconAt, label: "Ranks mentions" },
  { icon: IconSparkles, label: "Suggests skills" },
  { icon: IconFlag, label: "Spots scope creep" },
];

const W = 1088;
const H = 360;
const MID_Y = 130;
const ITEM = { x: 0, w: 236, h: 116 };
const NODE = { x: 320, size: 132 };
const NODE_RIGHT = NODE.x + NODE.size;
const NODE_CX = NODE.x + NODE.size / 2;
const ANSWERS_X = 556;
const USES_Y = 316;
const COL = W / USES.length;
const FAN = 3;

/**
 * Framed low on the judge while the fan is still empty, then the camera rises
 * and eases back to take in the six uses.
 */
const SHOTS: readonly CameraShot[] = [
  { rotateX: 5, rotateY: -5, translateZ: -24, y: 70 },
  { rotateX: 2, rotateY: -2, y: 60 },
  { y: 60 },
  { rotateX: 3, translateZ: -18, y: -4 },
];

/** Behind the item, then the judge, then the judge again as the uses fan out. */
const GLOW = [
  { x: ITEM.w / 2, y: MID_Y, size: 380 },
  { x: NODE_CX, y: MID_Y, size: 460 },
  { x: ANSWERS_X + 300, y: MID_Y, size: 560 },
  { x: NODE_CX, y: 220, size: 620 },
];

const toQuestion = (y: number) =>
  `M ${NODE_RIGHT + 4} ${MID_Y} C ${NODE_RIGHT + 50} ${MID_Y}, ${ANSWERS_X - 50} ${y}, ${ANSWERS_X - 8} ${y}`;
const toUse = (index: number) => {
  const x = COL * index + COL / 2;
  return `M ${NODE_CX} ${MID_Y + NODE.size / 2 + 4} C ${NODE_CX} 262, ${x} 238, ${x} ${USES_Y - 26}`;
};

function ItemCard() {
  const fanned = useDeckStep() >= FAN;
  return (
    <m.div
      className="absolute flex flex-col justify-between rounded-[20px] bg-white/[0.06] p-5 ring-1 ring-white/10 ring-inset"
      style={{
        left: ITEM.x,
        top: MID_Y - ITEM.h / 2,
        width: ITEM.w,
        height: ITEM.h,
      }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: fanned ? 0.4 : 1, y: 0 }}
      transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.45 }}
    >
      <div className="flex items-center gap-2 text-xs text-white/45">
        <IconListCheck size={15} stroke={1.7} aria-hidden />
        Task
      </div>
      <div className="text-lg leading-snug font-medium text-white/90">
        Export shows the wrong date
      </div>
    </m.div>
  );
}

function JevNode() {
  const step = useDeckStep();
  return (
    <m.div
      className="absolute"
      style={{
        left: NODE.x,
        top: MID_Y - NODE.size / 2,
        width: NODE.size,
        height: NODE.size,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: step >= 1 ? 1.04 : 1 }}
      transition={{
        type: "spring",
        bounce: 0,
        duration: 0.8,
        delay: step >= 1 ? 0.55 : 0.6,
      }}
    >
      <Sheen step={1} delay={0.7} className="size-full rounded-[30px]">
        <div
          className="relative flex size-full flex-col items-center justify-center rounded-[30px] ring-1 ring-white/15 ring-inset"
          style={{
            background: `linear-gradient(145deg, ${BRAND.purple}40, ${BRAND.blue}33)`,
          }}
        >
          <span className="absolute top-4 right-4">
            <Pulse color={BRAND.blue} size={7} step={1} delay={0.6} />
          </span>
          <span className="text-4xl font-semibold tracking-[-0.02em] text-white">
            Jev
          </span>
        </div>
      </Sheen>
    </m.div>
  );
}

function UseChip({ use, index }: { use: Use; index: number }) {
  const fanned = useDeckStep() >= FAN;
  const at = 0.75 + index * 0.09;
  return (
    <m.div
      className="flex justify-center"
      initial={{ opacity: 0, y: 12 }}
      animate={fanned ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={cueTransition(fanned, at, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      <Fri2Chip icon={use.icon} label={use.label} lit={fanned} delay={at} />
    </m.div>
  );
}

export function FridayJev() {
  return (
    <Shell className="py-12">
      <Title size="md">
        One small model that <Accent>decides</Accent>.
      </Title>

      <div className="flex flex-1 flex-col justify-center pb-10">
        <Camera shots={SHOTS}>
          <div
            className="relative isolate"
            style={{ width: W, height: H, transformStyle: "preserve-3d" }}
          >
            <Layer depth={-60} className="absolute -inset-x-12 -inset-y-10">
              <GridBackdrop variant="dots" cell={26} period={10} />
            </Layer>
            <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />

            {/* The item travels into the judge. */}
            <div className="absolute inset-0">
              <DrawPath
                d={`M ${ITEM.w + 6} ${MID_Y} L ${NODE.x - 8} ${MID_Y}`}
                width={W}
                height={H}
                step={1}
                duration={0.6}
                dot
              />
            </div>

            {/* The judge asks each typed question. */}
            {FRI3_JEV_QUESTIONS.map((question, index) => (
              <div key={question.kind} className="absolute inset-0">
                <DrawPath
                  d={toQuestion(question.y)}
                  width={W}
                  height={H}
                  step={1}
                  delay={0.45 + index * 0.1}
                  duration={0.7}
                />
              </div>
            ))}

            {/* And the same judge answers for every use in Eva. */}
            {USES.map((use, index) => (
              <div key={use.label} className="absolute inset-0">
                <DrawPath
                  d={toUse(index)}
                  width={W}
                  height={H}
                  step={FAN}
                  delay={0.2 + index * 0.07}
                  duration={0.8}
                  dot
                />
              </div>
            ))}

            <ItemCard />
            <JevNode />
            <Fri3JevAnswers left={ANSWERS_X} />

            <div
              className="absolute inset-x-0 grid"
              style={{
                top: USES_Y - 22,
                gridTemplateColumns: `repeat(${USES.length}, 1fr)`,
              }}
            >
              {USES.map((use, index) => (
                <UseChip key={use.label} use={use} index={index} />
              ))}
            </div>
          </div>
        </Camera>
      </div>

      <Footnote>
        TypeSafe Jev joined Eva on 17 September 2026; the six uses shipped on 18
        and 22 September 2026 (Eva changelog). The task and answers shown are an
        illustration.
      </Footnote>
    </Shell>
  );
}
