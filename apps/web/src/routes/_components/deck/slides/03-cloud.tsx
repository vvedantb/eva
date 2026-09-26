import type { ReactNode } from "react";
import { m } from "motion/react";
import { Camera } from "../_components/DeckCamera";
import type { CameraShot } from "../_components/DeckCamera";
import {
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../_components/DeckPrimitives";
import {
  CountRoll,
  DUR,
  EASE,
  LEAVE,
  useMotionCue,
} from "../_components/motion";
import { CloudVisual } from "./_parts/cloud-visual";

/**
 * Square on while the laptop is still the story, swinging round as the work
 * moves to the cloud, then easing back as the counters take the eye.
 */
const CLOUD_SHOTS: readonly CameraShot[] = [
  {},
  { rotateY: -10, rotateX: 6, translateZ: 60 },
  { rotateY: -4, rotateX: 3, translateZ: 20, scale: 0.96 },
];

const NUMBER_CLASS =
  "text-[32px] leading-[1.15] font-semibold tracking-[-0.03em] whitespace-nowrap text-white tabular-nums";

/** The numbers carry the card; each label is four words at most. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <StaggerItem className="h-full">
      <Card className="flex h-[132px] flex-col justify-between rounded-[20px] p-4">
        <div className={NUMBER_CLASS}>{children}</div>
        <div className="text-sm leading-snug text-balance text-white/60">
          {label}
        </div>
      </Card>
    </StaggerItem>
  );
}

/** The arrow in "10 → 23" travels from the old figure to the new one. */
function Towards() {
  const { on, delay } = useMotionCue(undefined, 0.35);
  return (
    <m.span
      className="mx-1 inline-block text-white/40"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: on ? 1 : 0, x: on ? 0 : -10 }}
      transition={on ? { duration: DUR.slow, ease: EASE.expo, delay } : LEAVE}
    >
      &rarr;
    </m.span>
  );
}

export function Slide03Cloud() {
  return (
    <Shell>
      <div className="grid grid-cols-[480px_560px] items-center gap-10">
        <div>
          <Reveal>
            <Kicker>Three months · The cloud</Kicker>
            <Title size="md">Nothing was built on a laptop.</Title>
            <Body className="text-lg">
              Written, tested and shipped from a browser tab.
            </Body>
          </Reveal>

          <Stagger
            step={2}
            delayChildren={0.1}
            staggerChildren={0.12}
            className="mt-12 grid grid-cols-3 gap-3"
          >
            <Stat label="changes written by Eva">
              <CountRoll value={346} step={2} duration={1.3} delay={0.25} />
            </Stat>
            <Stat label="bundles Eva finished alone">
              <CountRoll value={33} step={2} duration={1.3} delay={0.37} />
            </Stat>
            <Stat label="August to early September">
              <CountRoll value={10} step={2} duration={1.1} delay={0.45} />
              <Towards />
              <CountRoll value={23} step={2} duration={1.3} delay={0.75} />
            </Stat>
          </Stagger>
        </div>

        <Camera shots={CLOUD_SHOTS} className="h-[560px]">
          <CloudVisual />
        </Camera>
      </div>

      <Footnote>
        <Reveal step={2} delay={0.5}>
          Counted from the author recorded on each change in the project&rsquo;s
          history.
        </Reveal>
      </Footnote>
    </Shell>
  );
}
