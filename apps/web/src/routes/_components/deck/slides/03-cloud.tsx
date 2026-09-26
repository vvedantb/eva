import type { ReactNode } from "react";
import { CountUp } from "../_components/CountUp";
import { Camera } from "../_components/DeckCamera";
import type { CameraShot } from "../_components/DeckCamera";
import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../_components/DeckPrimitives";
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
  "text-[32px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap text-white tabular-nums";

/** The numbers carry the card; each label is four words at most. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <StaggerItem className="h-full">
      <div className="flex h-[132px] flex-col justify-between rounded-[20px] bg-white/[0.05] p-4">
        <div className={NUMBER_CLASS}>{children}</div>
        <div className="text-sm leading-snug text-balance text-white/60">
          {label}
        </div>
      </div>
    </StaggerItem>
  );
}

export function Slide03Cloud() {
  return (
    <Shell>
      <div className="grid grid-cols-[480px_560px] items-center gap-10">
        <div>
          <Reveal>
            <Kicker>Where the work happens</Kicker>
            <Title size="md">Nothing was built on a laptop.</Title>
            <Body className="text-lg">
              Written, tested and shipped from a browser tab.
            </Body>
          </Reveal>

          <Stagger
            step={2}
            delayChildren={0.1}
            staggerChildren={0.1}
            className="mt-12 grid grid-cols-3 gap-3"
          >
            <Stat label="changes written by Eva">
              <CountUp value={346} step={2} duration={1.2} delay={0.2} />
            </Stat>
            <Stat label="bundles Eva finished alone">
              <CountUp value={33} step={2} duration={1.2} delay={0.3} />
            </Stat>
            <Stat label="August to early September">
              <CountUp value={10} step={2} duration={1.2} delay={0.4} />
              <span className="mx-1 text-white/40">&rarr;</span>
              <CountUp value={23} step={2} duration={1.2} delay={0.5} />
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
