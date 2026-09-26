import type { Icon } from "@tabler/icons-react";
import {
  IconDeviceMobile,
  IconFileCode,
  IconGauge,
  IconGitBranch,
  IconInbox,
  IconLink,
  IconRobot,
  IconUserStar,
} from "@tabler/icons-react";
import { m } from "motion/react";
import type { TargetAndTransition } from "motion/react";
import { motionSpring } from "@eva/ui";
import {
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../_components/DeckPrimitives";

interface Item {
  icon: Icon;
  title: string;
  /**
   * A small gesture the icon makes once its card has landed. Keyframes, so it
   * runs as a tween: Motion drops a spring that is handed an array.
   */
  nudge: TargetAndTransition;
}

/** Descriptions for each of these live in the slide's speaker notes. */
const ITEMS: readonly Item[] = [
  {
    icon: IconUserStar,
    title: "Manager Ave",
    nudge: { scale: [1, 1.22, 1], rotate: [0, -8, 0] },
  },
  {
    icon: IconRobot,
    title: "Automations Hub",
    nudge: { rotate: [0, -12, 9, 0] },
  },
  { icon: IconInbox, title: "Two-pane inbox", nudge: { y: [0, -7, 2, 0] } },
  {
    icon: IconDeviceMobile,
    title: "Works on your phone",
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
    nudge: { rotate: [0, -24, 16, 0] },
  },
  {
    icon: IconGitBranch,
    title: "Reads sibling repos",
    nudge: { x: [0, 6, -3, 0] },
  },
];

const DELAY_CHILDREN = 0.4;
const STAGGER = 0.08;
/** The card's own entry takes half a second; the icon moves once it is down. */
const NUDGE_AFTER = 0.35;

export function Slide08More() {
  return (
    <Shell>
      <Reveal>
        <Kicker>Also shipped</Kicker>
        <Title>And a great deal more.</Title>
      </Reveal>

      {/* No build steps here, so no camera moves. The depth instead lives in
          the hover: each card carries its own viewing distance, which tilts it
          about its own centre rather than the grid's. */}
      <div className="flex flex-1 items-center pt-4">
        <Stagger
          delayChildren={DELAY_CHILDREN}
          staggerChildren={STAGGER}
          className="grid w-full grid-cols-4 gap-4 [transform-style:preserve-3d]"
        >
          {ITEMS.map((item, index) => (
            <StaggerItem key={item.title}>
              <m.div
                style={{
                  transformPerspective: 900,
                  transformStyle: "preserve-3d",
                }}
                whileHover={{ rotateX: -6, rotateY: 4, z: 24 }}
                transition={motionSpring}
              >
                <div className="flex h-[176px] flex-col justify-between rounded-[24px] bg-white/[0.05] p-6">
                  <m.div
                    aria-hidden
                    className="w-fit text-white/75"
                    animate={item.nudge}
                    transition={{
                      duration: 0.7,
                      ease: "easeInOut",
                      delay: DELAY_CHILDREN + index * STAGGER + NUDGE_AFTER,
                    }}
                  >
                    <item.icon size={34} stroke={1.5} />
                  </m.div>
                  <div className="text-xl leading-tight font-semibold text-balance text-white">
                    {item.title}
                  </div>
                </div>
              </m.div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Shell>
  );
}
