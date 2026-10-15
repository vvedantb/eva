import type { Icon } from "@tabler/icons-react";
import {
  IconDatabase,
  IconGitMerge,
  IconGitPullRequest,
  IconHourglassHigh,
  IconRobot,
  IconRocket,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  EASE,
  LEAVE,
  Pulse,
  cueTransition,
} from "../../_components/motion";
import { PipelineConnector, PipelineNode } from "../_parts/Pipeline";

const ICON_SIZE = 26;

interface Stage {
  icon: Icon;
  label: string;
}

/** The route both repositories share; only the last label differs. */
const ROUTE: readonly Stage[] = [
  { icon: IconGitPullRequest, label: "Moved to code review" },
  { icon: IconRobot, label: "Grok bot notified" },
  { icon: IconDatabase, label: "Migrations and backend applied" },
  { icon: IconRocket, label: "Deployed" },
  { icon: IconGitMerge, label: "Pull request merged" },
];

const CAREPULSE_LAST = "On CarePulse in minutes";

const HOP = 0.42;
const START = 0.35;
const nodeAt = (index: number) => START + index * HOP;

/** Eva fills the frame, the camera drops to CarePulse, then pulls back on both. */
const SHOTS: readonly CameraShot[] = [
  { translateZ: 30, y: 60 },
  { translateZ: 20, y: 50 },
  { y: -10 },
  { translateZ: -30 },
];

interface LaneProps {
  name: string;
  /** The first node: the task arriving in code review. */
  shown: boolean;
  /** The rest of the route, lit one stop at a time. */
  running: boolean;
  /** The build step that lights the route, which cues each node's sheen. */
  step: number;
  lastLabel?: string;
}

function Lane({ name, shown, running, step, lastLabel }: LaneProps) {
  return (
    <div>
      <m.div
        className="mb-3 text-sm font-medium text-white/50"
        initial={{ opacity: 0, x: -12 }}
        animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
        transition={cueTransition(shown, 0, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      >
        {name}
      </m.div>
      <div className="flex items-stretch">
        {ROUTE.map((stage, index) => {
          const last = index === ROUTE.length - 1;
          const first = index === 0;
          return (
            <div key={stage.label} className="flex items-stretch">
              {first ? null : (
                <PipelineConnector
                  active={running}
                  delay={nodeAt(index) - 0.3}
                />
              )}
              <PipelineNode
                icon={<stage.icon size={ICON_SIZE} />}
                label={last && lastLabel ? lastLabel : stage.label}
                active={first ? shown : running}
                delay={first ? 0.15 : nodeAt(index)}
                step={first ? 0 : step}
                flash={last}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The stalled CarePulse route: a chip sits over the empty stops while the
 * work waits for a person, and leaves when the route starts to run.
 */
function Waiting({ shown }: { shown: boolean }) {
  return (
    <m.div
      aria-hidden={!shown}
      className="pointer-events-none absolute inset-y-0 right-0 left-[228px] flex items-end justify-center pb-[52px]"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }}
      transition={
        shown ? { duration: DUR.slow, ease: EASE.expo, delay: 0.55 } : LEAVE
      }
    >
      <div className="flex items-center gap-2.5 rounded-full bg-white/[0.08] px-5 py-2.5 text-base text-white/85">
        <Pulse step={2} size={8} delay={0.7} />
        <IconHourglassHigh size={18} className="text-white/60" aria-hidden />
        <span className="tabular-nums">43 waiting for a person</span>
      </div>
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

      <Camera shots={SHOTS} className="my-auto pb-8">
        <m.div
          animate={{ opacity: step >= 2 ? 0.55 : 1 }}
          transition={cueTransition(step >= 2, 0, {
            duration: DUR.slow,
            ease: EASE.out,
          })}
        >
          <Lane name="Eva, today" shown running={step >= 1} step={1} />
        </m.div>

        <m.div
          className="relative mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: step >= 2 ? 1 : 0 }}
          transition={cueTransition(step >= 2, 0, { duration: DUR.base })}
        >
          <Lane
            name={step >= 3 ? "CarePulse, the goal" : "CarePulse, today"}
            shown={step >= 2}
            running={step >= 3}
            step={3}
            lastLabel={CAREPULSE_LAST}
          />
          <Waiting shown={step === 2} />
        </m.div>
      </Camera>

      <Footnote>
        Auto-merge on Eva since 3 September 2026. CarePulse: 43 quick tasks in
        code review on 11 September 2026. The CarePulse route is a goal.
      </Footnote>
    </Shell>
  );
}
