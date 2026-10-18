import type { Icon } from "@tabler/icons-react";
import {
  IconFileCheck,
  IconFilter,
  IconFlag,
  IconLayoutDashboard,
  IconMoodSmile,
  IconPlugConnected,
  IconSparkles,
  IconTag,
  IconUserQuestion,
  IconBellRinging,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  useInk,
  Accent,
  BRAND,
  Footnote,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  DrawPath,
  EASE,
  Pulse,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import { Fri2Chip } from "../_parts/Fri2Chip";

interface Feature {
  icon: Icon;
  label: string;
  /** The condition Jev is given, close to the wording in the code. */
  asks: string;
  kind: string;
}

/** The three the room will recognise, each with the question Jev answers. */
const FEATURES: readonly Feature[] = [
  {
    icon: IconFileCheck,
    label: "Is the prompt detailed enough?",
    asks: "Does it state the expected outcome?",
    kind: "Yes / no",
  },
  {
    icon: IconSparkles,
    label: "Which skill should it use?",
    asks: "Which listed skill best fits this request?",
    kind: "Pick one",
  },
  {
    icon: IconUserQuestion,
    label: "Who should answer this?",
    asks: "Is this person one of the right people to answer?",
    kind: "Yes / no, per person",
  },
];

interface More {
  icon: Icon;
  label: string;
}

/** Every other place Eva asks Jev, in the order they shipped. */
const MORE: readonly More[] = [
  { icon: IconTag, label: "Tags tasks" },
  { icon: IconFilter, label: "Sorts findings by severity" },
  { icon: IconBellRinging, label: "Decides how urgent a mention is" },
  { icon: IconPlugConnected, label: "Any agent can ask it" },
  { icon: IconFlag, label: "Spots changes nobody asked for" },
  { icon: IconLayoutDashboard, label: "Lays out panels in chat" },
  { icon: IconMoodSmile, label: "Picks reactions" },
];

const FEATURES_STEP = 1;
const MORE_STEP = 2;

const W = 1088;
const H = 380;
const NODE = { x: 0, size: 120 };
const NODE_CY = H / 2;
const CARD = { x: 196, w: 452, h: 108, gap: 28 };
const MORE_X = CARD.x + CARD.w + 48;
const cardY = (index: number) => 8 + index * (CARD.h + CARD.gap);

const SHOTS: readonly CameraShot[] = [
  { rotateY: 8, translateZ: -30, x: 60 },
  { rotateY: 3, x: 20 },
  { rotateY: -3, translateZ: -20 },
];

const GLOW = [
  { x: NODE.size / 2, y: NODE_CY, size: 380 },
  { x: CARD.x + CARD.w / 2, y: NODE_CY, size: 620 },
  { x: MORE_X + 180, y: NODE_CY, size: 620 },
];

const toCard = (index: number) => {
  const y = cardY(index) + CARD.h / 2;
  const from = NODE.x + NODE.size + 6;
  return `M ${from} ${NODE_CY} C ${from + 40} ${NODE_CY}, ${CARD.x - 40} ${y}, ${CARD.x - 8} ${y}`;
};

function JevNode() {
  const step = useDeckStep();
  return (
    <m.div
      className="absolute flex items-center justify-center rounded-[28px] ring-1 ring-white/15 ring-inset"
      style={{
        left: NODE.x,
        top: NODE_CY - NODE.size / 2,
        width: NODE.size,
        height: NODE.size,
        background: `linear-gradient(145deg, ${BRAND.purple}40, ${BRAND.blue}33)`,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: step >= FEATURES_STEP ? 1.04 : 1 }}
      transition={{ type: "spring", bounce: 0, duration: 0.8, delay: 0.4 }}
    >
      <span className="absolute top-3.5 right-3.5">
        <Pulse color={BRAND.blue} size={7} step={FEATURES_STEP} delay={0.3} />
      </span>
      <span className="text-4xl font-semibold tracking-[-0.02em] text-white">
        Jev
      </span>
    </m.div>
  );
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const ink = useInk();
  const step = useDeckStep();
  const lit = step >= FEATURES_STEP;
  const at = step === FEATURES_STEP ? 0.55 + index * 0.35 : 0;
  const Glyph = feature.icon;

  return (
    <m.div
      className="absolute flex items-center gap-5 rounded-[22px] px-6 ring-1 ring-white/10 ring-inset"
      style={{
        left: CARD.x,
        top: cardY(index),
        width: CARD.w,
        height: CARD.h,
      }}
      initial={{ opacity: 0, x: -16 }}
      animate={{
        opacity: lit ? 1 : 0.3,
        x: lit ? 0 : -8,
        backgroundColor: lit ? ink(0.07) : ink(0.03),
      }}
      transition={
        lit
          ? { duration: DUR.slow, ease: EASE.expo, delay: at }
          : { duration: DUR.slow, ease: EASE.out, delay: 0.5 + index * 0.08 }
      }
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B3FB8]/35 to-[#3B7DD8]/35">
        <Glyph size={22} stroke={1.6} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xl leading-tight font-semibold text-white">
          {feature.label}
        </div>
        <m.div
          className="mt-2 flex items-center gap-2 text-sm text-white/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: lit ? 1 : 0 }}
          transition={cueTransition(lit, at + 0.3, { duration: DUR.base })}
        >
          <span className="shrink-0 rounded-full bg-white/[0.08] px-2 py-0.5 text-xs whitespace-nowrap text-white/70">
            {feature.kind}
          </span>
          <span className="truncate">“{feature.asks}”</span>
        </m.div>
      </div>
    </m.div>
  );
}

export function FridayJev() {
  const step = useDeckStep();
  const more = step >= MORE_STEP;

  return (
    <Shell className="py-14">
      <Title size="md">
        Ten small decisions <Accent>inside Eva</Accent>.
      </Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative isolate" style={{ width: W, height: H }}>
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />

          {FEATURES.map((feature, index) => (
            <div key={feature.label} className="absolute inset-0">
              <DrawPath
                d={toCard(index)}
                width={W}
                height={H}
                step={FEATURES_STEP}
                delay={0.25 + index * 0.35}
                duration={0.6}
                dot
              />
            </div>
          ))}

          <JevNode />
          {FEATURES.map((feature, index) => (
            <FeatureCard key={feature.label} feature={feature} index={index} />
          ))}

          <div
            className="absolute flex flex-col gap-1.5"
            style={{ left: MORE_X, top: 0, width: W - MORE_X }}
          >
            <m.div
              className="mb-1.5 text-sm font-medium text-white/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: more ? 1 : 0 }}
              transition={cueTransition(more, 0.15, { duration: DUR.base })}
            >
              And seven more
            </m.div>
            {MORE.map((item, index) => (
              <Fri2Chip
                key={item.label}
                icon={item.icon}
                label={item.label}
                lit={more}
                index={index}
                delay={0.3 + index * 0.09}
              />
            ))}
          </div>
        </div>
      </Camera>

      <Footnote>
        Uses shipped 21 September to 12 October 2026 (Eva git history). Teammate
        routing sits behind the Ask teammates experiment. Questions are
        shortened from the code.
      </Footnote>
    </Shell>
  );
}
