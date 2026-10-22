import { IconArrowRight, IconCircleCheckFilled } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Connector,
  DUR,
  EASE,
  Pulse,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import {
  BOARD_H,
  BOARD_W,
  DROP_AT,
  DROP_POINT,
  Fri4ReviewBoard,
} from "../_parts/Fri4ReviewBoard";
import { Fri4GrokRun, Fri4LivePage } from "../_parts/Fri4GrokRun";

const W = 1088;
const SIDE_X = BOARD_W + 24;
const CLOSING = 3;

/** Tilted on the board, square while the bot works, pulled back for the goal. */
const SHOTS: readonly CameraShot[] = [
  { rotateX: 7, rotateY: 4, translateZ: -30 },
  { rotateX: 3, rotateY: 2 },
  { rotateY: -3, translateZ: 16 },
  { translateZ: -36, y: -8 },
];

/** The light follows the work: the card, the bot, the live page, then all. */
const GLOW = [
  { x: 110, y: 160, size: 520 },
  { x: 330, y: 160, size: 560 },
  { x: SIDE_X + 210, y: 230, size: 620 },
  { x: W / 2, y: 200, size: 900 },
];

/** Eva today, CarePulse next: the one line the slide is building to. */
function Goal() {
  const shown = useDeckStep() >= CLOSING;
  const chip = "flex items-center gap-2 rounded-full px-4 py-2 text-base";

  return (
    <m.div
      className="mt-6 flex items-center justify-center gap-4"
      initial={{ opacity: 0, y: 18 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      transition={cueTransition(shown, 0.35, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      <span className={`${chip} bg-white/[0.07] text-white/80`}>
        <IconCircleCheckFilled size={18} className="text-[#3fb37f]" />
        Eva, today
      </span>
      <IconArrowRight size={20} className="text-white/35" aria-hidden />
      <span
        className={`${chip} bg-white/[0.1] text-white ring-1 ring-[#8B3FB8]/60`}
      >
        <Pulse step={CLOSING} delay={0.7} size={8} />
        CarePulse, next: on the repo in minutes
      </span>
    </m.div>
  );
}

export function FridayPipeline() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Title size="md">
        Code review to live, in <Accent>minutes</Accent>.
      </Title>

      <Camera shots={SHOTS} className="mt-8">
        <m.div
          className="relative isolate"
          style={{ width: W, height: BOARD_H }}
          animate={{ opacity: step >= CLOSING ? 0.5 : 1 }}
          transition={cueTransition(step >= CLOSING, 0, {
            duration: DUR.slow,
            ease: EASE.out,
          })}
        >
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
          <div className="absolute top-0 left-0">
            <Fri4ReviewBoard />
          </div>
          <div
            className="absolute top-0 flex flex-col gap-4"
            style={{ left: SIDE_X, width: W - SIDE_X }}
          >
            <Fri4GrokRun />
            <Fri4LivePage />
          </div>
          {/* The drop wakes the bot: a light runs from the card to its log. */}
          <m.div
            className="pointer-events-none absolute inset-0 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: step === 1 ? 1 : 0 }}
            transition={{ duration: DUR.fast, delay: step === 1 ? DROP_AT : 0 }}
          >
            <Connector
              from={DROP_POINT}
              to={{ x: SIDE_X - 4, y: 22 }}
              bend={-40}
              step={1}
              delay={DROP_AT}
              flowPeriod={1.1}
            />
          </m.div>
        </m.div>
      </Camera>

      <Goal />
    </Shell>
  );
}
