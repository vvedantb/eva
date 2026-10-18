import { cn } from "@eva/ui";
import type { Icon } from "@tabler/icons-react";
import {
  IconAdjustmentsHorizontal,
  IconBrain,
  IconCpu,
  IconDatabase,
  IconDownload,
  IconPlugConnected,
  IconSparkles,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  useAppScheme,
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
  MORPH,
  Pulse,
  SHARED,
  Spotlight,
  cueTransition,
} from "../../_components/motion";

const TUCK = 1;
const CLEAR = 2;

const W = 1088;
const H = 360;
const CARD_W = 290;
const CARD_H = 200;
const MID_Y = H / 2;
const BOX = { w: 330, h: 196, x: (1088 - 330) / 2 };
const RESULT_X = W - CARD_W;

interface Part {
  icon: Icon;
  label: string;
  /** Scattered across the route, in the way, before Eva takes it on. */
  loose: { x: number; y: number; rotate: number };
}

/** The machinery a coding agent usually asks you to think about. */
const PARTS: readonly Part[] = [
  { icon: IconCpu, label: "Which model", loose: { x: 330, y: 18, rotate: -6 } },
  {
    icon: IconAdjustmentsHorizontal,
    label: "Reasoning level",
    loose: { x: 560, y: 4, rotate: 5 },
  },
  { icon: IconBrain, label: "Thinking", loose: { x: 300, y: 300, rotate: 4 } },
  {
    icon: IconDatabase,
    label: "Context window",
    loose: { x: 540, y: 312, rotate: -5 },
  },
  {
    icon: IconPlugConnected,
    label: "MCP tools",
    loose: { x: 650, y: 96, rotate: 7 },
  },
  {
    icon: IconSparkles,
    label: "Skills",
    loose: { x: 660, y: 236, rotate: -4 },
  },
];

/** Where each part sits once tucked inside Eva: two columns of three. */
function tucked(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return { x: BOX.x + 20 + column * 150, y: MID_Y - 50 + row * 38 };
}

const SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -30 },
  { rotateX: 3, translateZ: 4 },
  { translateZ: -20 },
];

const GLOW = [
  { x: W / 2, y: MID_Y, size: 760 },
  { x: BOX.x + BOX.w / 2, y: MID_Y, size: 520 },
  { x: W / 2, y: MID_Y, size: 900 },
];

function PartChip({ part, index }: { part: Part; index: number }) {
  const step = useDeckStep();
  const inside = step >= TUCK;
  const gone = step >= CLEAR;
  const spot = inside ? tucked(index) : part.loose;
  const Glyph = part.icon;

  return (
    <m.div
      className="absolute top-0 left-0 flex h-9 items-center gap-2 rounded-full bg-white/[0.08] px-3.5 text-sm whitespace-nowrap text-white/80 ring-1 ring-white/10 ring-inset"
      initial={{ opacity: 0, x: part.loose.x, y: part.loose.y, rotate: 0 }}
      animate={{
        opacity: gone ? 0.35 : 1,
        x: spot.x,
        y: spot.y,
        rotate: inside ? 0 : part.loose.rotate,
        scale: inside ? 0.86 : 1,
      }}
      transition={
        inside
          ? {
              type: "spring",
              bounce: 0.18,
              duration: 0.9,
              delay: step === TUCK ? 0.15 + index * 0.08 : 0,
            }
          : {
              opacity: { duration: DUR.slow, delay: 0.5 + index * 0.08 },
              default: { duration: DUR.slow, ease: EASE.out },
            }
      }
    >
      <Glyph size={16} stroke={1.7} />
      {part.label}
    </m.div>
  );
}

/** The box the machinery goes into. It arrives as the parts fly in. */
function EvaBox() {
  const step = useDeckStep();
  const shown = step >= TUCK;
  const quiet = step >= CLEAR;

  return (
    <m.div
      className="absolute rounded-[26px] ring-1 ring-white/15 ring-inset"
      style={{
        left: BOX.x,
        top: MID_Y - BOX.h / 2,
        width: BOX.w,
        height: BOX.h,
        background: `linear-gradient(145deg, ${BRAND.purple}2e, ${BRAND.blue}22), var(--deck-box, #121019)`,
      }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{
        opacity: shown ? (quiet ? 0.7 : 1) : 0,
        scale: shown ? 1 : 0.92,
      }}
      transition={cueTransition(shown, 0, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      <div className="flex items-center gap-2 px-5 pt-4 text-sm font-medium text-white/70">
        <Pulse color={BRAND.blue} size={7} step={TUCK} delay={0.8} />
        Handled by Eva
      </div>
    </m.div>
  );
}

function PromptCard() {
  const appScheme = useAppScheme();
  const clear = useDeckStep() >= CLEAR;
  return (
    // The Simple Mode prompt box from the slide before grows into this card.
    <m.div
      layoutId={SHARED.prompt}
      className={cn(
        appScheme,
        "absolute flex flex-col overflow-hidden rounded-2xl bg-background p-5 ring-1 ring-white/10",
      )}
      style={{
        left: 0,
        top: MID_Y - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
      }}
      initial={false}
      animate={{ scale: clear ? 1.04 : 1 }}
      transition={{ duration: DUR.hero, ease: EASE.expo, layout: MORPH }}
    >
      <div className="text-xs font-medium text-muted-foreground">You</div>
      <div className="mt-auto rounded-2xl bg-card px-4 py-3 text-base leading-snug text-foreground ring-1 ring-border">
        Add an export button to the reports page
      </div>
    </m.div>
  );
}

function ResultCard() {
  const appScheme = useAppScheme();
  const clear = useDeckStep() >= CLEAR;
  return (
    <m.div
      className={cn(
        appScheme,
        "absolute flex flex-col overflow-hidden rounded-2xl bg-background ring-1 ring-white/10",
      )}
      style={{
        left: RESULT_X,
        top: MID_Y - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
      }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0, scale: clear ? 1.04 : 1 }}
      transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.35 }}
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-border/60 px-3">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-auto text-2xs text-muted-foreground">
          Live preview
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-foreground">
            Reports
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            <IconDownload size={13} />
            Export
          </span>
        </div>
        {[0.9, 0.7, 0.8].map((width) => (
          <span
            key={width}
            className="h-2 rounded-full bg-muted"
            style={{ width: `${width * 100}%` }}
          />
        ))}
      </div>
    </m.div>
  );
}

export function FridayAbstracted() {
  const ink = useInk();
  return (
    <Shell className="py-14">
      <Title size="md">
        You ask. You see the result. <Accent>That is all</Accent>.
      </Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative isolate" style={{ width: W, height: H }}>
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />

          {/* The route from what you asked to what you got. */}
          <div className="absolute inset-0">
            <DrawPath
              d={`M ${CARD_W + 8} ${MID_Y} L ${RESULT_X - 8} ${MID_Y}`}
              width={W}
              height={H}
              delay={0.6}
              duration={1.1}
              strokeWidth={1.5}
              color={ink(0.16)}
            />
          </div>
          <div className="absolute inset-0">
            <DrawPath
              d={`M ${CARD_W + 8} ${MID_Y} L ${RESULT_X - 8} ${MID_Y}`}
              width={W}
              height={H}
              step={CLEAR}
              delay={0.2}
              duration={0.9}
              strokeWidth={2}
              dot
            />
          </div>

          <EvaBox />
          <PromptCard />
          <ResultCard />
          {PARTS.map((part, index) => (
            <PartChip key={part.label} part={part} index={index} />
          ))}
        </div>
      </Camera>

      <Footnote>
        In Simple Mode these choices are made for you; Advanced view keeps every
        control for anyone who wants them.
      </Footnote>
    </Shell>
  );
}
