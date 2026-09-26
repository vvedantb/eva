import type { Icon } from "@tabler/icons-react";
import {
  IconFileCode,
  IconGauge,
  IconGitBranch,
  IconKeyboard,
  IconLink,
  IconPencil,
  IconPin,
  IconSparkles,
} from "@tabler/icons-react";
import { m } from "motion/react";
import type { TargetAndTransition } from "motion/react";
import { motionSpring } from "@eva/ui";
import {
  Card,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../_components/DeckPrimitives";
import { CountRoll, EASE, GridBackdrop } from "../_components/motion";

interface Item {
  icon: Icon;
  title: string;
  /**
   * A small gesture the icon makes once its card has landed. Keyframes, so it
   * runs as a tween: Motion drops a spring that is handed an array.
   */
  nudge: TargetAndTransition;
  /** A leading figure that rolls in, followed by the rest of the title. */
  figure?: { value: number; rest: string };
}

/** Descriptions for each of these live in the slide's speaker notes. */
const ITEMS: readonly Item[] = [
  {
    icon: IconPencil,
    title: "Suggested edits in documents",
    nudge: { scale: [1, 1.22, 1], rotate: [0, -8, 0] },
  },
  {
    icon: IconSparkles,
    title: "Claude's built-in skills",
    nudge: { rotate: [0, -12, 9, 0] },
  },
  {
    icon: IconPin,
    title: "Previews that stay put",
    nudge: { y: [0, -7, 2, 0] },
  },
  {
    icon: IconKeyboard,
    title: "Rebindable shortcuts",
    nudge: { rotate: [0, -14, 8, 0] },
  },
  {
    icon: IconLink,
    title: "Rich link previews",
    nudge: { rotate: [0, 45, 0] },
  },
  {
    icon: IconFileCode,
    title: "Edit files in the browser",
    nudge: { y: [0, -6, 0], scale: [1, 1.1, 1] },
  },
  {
    icon: IconGauge,
    title: "94% lighter animations",
    figure: { value: 94, rest: " lighter animations" },
    nudge: { rotate: [0, -24, 16, 0] },
  },
  {
    icon: IconGitBranch,
    title: "Reads sibling repos",
    nudge: { x: [0, 6, -3, 0] },
  },
];

const COLUMNS = 4;
const DELAY_CHILDREN = 0.45;
/** Cards land as a diagonal wave: each step along a row or down a column. */
const WAVE = 0.08;
/** The card's own entry takes half a second; the icon moves once it is down. */
const NUDGE_AFTER = 0.45;

const waveDelay = (index: number) =>
  DELAY_CHILDREN + (Math.floor(index / COLUMNS) + (index % COLUMNS)) * WAVE;

function ItemTitle({ item, delay }: { item: Item; delay: number }) {
  if (!item.figure) return item.title;
  return (
    <>
      <CountRoll
        value={item.figure.value}
        suffix="%"
        delay={delay}
        duration={1.4}
      />
      {item.figure.rest}
    </>
  );
}

export function Slide08More() {
  return (
    <Shell className="isolate">
      <GridBackdrop variant="dots" cell={28} period={9} className="top-1/4" />
      <Reveal>
        <Kicker>Trust and reach · Also shipped</Kicker>
        <Title>And a great deal more.</Title>
      </Reveal>

      {/* No build steps, so the one hero move is on entry: the whole grid
          lands from a tilted plane while its cards arrive as a diagonal wave.
          Each card keeps its own viewing distance for the hover tilt. */}
      <div className="flex flex-1 items-center pt-4">
        <m.div
          className="grid w-full grid-cols-4 gap-4"
          style={{ transformPerspective: 1400, transformOrigin: "50% 0%" }}
          initial={{ rotateX: 14, y: 48 }}
          animate={{ rotateX: 0, y: 0 }}
          transition={{ duration: 1.5, ease: EASE.expo, delay: 0.3 }}
        >
          {ITEMS.map((item, index) => (
            <Reveal key={item.title} delay={waveDelay(index)} distance={28}>
              <m.div
                style={{
                  transformPerspective: 900,
                  transformStyle: "preserve-3d",
                }}
                whileHover={{ rotateX: -6, rotateY: 4, z: 24 }}
                transition={motionSpring}
              >
                <Card className="flex h-[176px] flex-col justify-between rounded-[24px]">
                  <m.div
                    aria-hidden
                    className="w-fit text-white/75"
                    animate={item.nudge}
                    transition={{
                      duration: 0.7,
                      ease: "easeInOut",
                      delay: waveDelay(index) + NUDGE_AFTER,
                    }}
                  >
                    <item.icon size={34} stroke={1.5} />
                  </m.div>
                  <div className="text-xl leading-tight font-semibold text-balance text-white">
                    <ItemTitle item={item} delay={waveDelay(index) + 0.2} />
                  </div>
                </Card>
              </m.div>
            </Reveal>
          ))}
        </m.div>
      </div>
    </Shell>
  );
}
