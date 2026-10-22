import {
  IconGitMerge,
  IconGitPullRequestDraft,
  IconHandClick,
  IconMoonStars,
  IconPointerFilled,
  IconRocket,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Card,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import { GrokMark } from "@/lib/components/grokBot/GrokMark";
import { DUR, EASE, cueTransition } from "../_components/motion";
import { PipelineConnector, PipelineNode } from "./_parts/Pipeline";

const ICON_SIZE = 26;

/** Nightly routines, in the order they run. */
const ROUTINES = [
  "Find critical bugs",
  "Add test coverage",
  "Generate docs",
  "Improve code structure",
  "Code quality review",
  "Daily standup 08:00",
];

/**
 * Step 1 is one chain reaction: the cursor clicks the human step, then each
 * rail carries a light to the next stage, which lights as the light arrives.
 */
const CLICK = 0.55;
const HOP = 0.45;
const at = (hop: number) => CLICK + 0.1 + hop * HOP;

/** Centre of the human node, in the pipeline row's pixels. */
const TARGET = { x: 176 + 52 + 96, y: 78 };

function Cursor() {
  const clicking = useDeckStep() === 1;
  return (
    <m.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-10 text-white"
      initial={{ opacity: 0, x: TARGET.x + 140, y: TARGET.y + 120 }}
      animate={
        clicking
          ? {
              opacity: [0, 1, 1, 0],
              x: TARGET.x,
              y: TARGET.y,
              scale: [1, 1, 0.82, 1],
            }
          : { opacity: 0, x: TARGET.x + 140, y: TARGET.y + 120, scale: 1 }
      }
      transition={
        clicking
          ? {
              x: { duration: CLICK, ease: EASE.expo },
              y: { duration: CLICK, ease: EASE.expo },
              scale: {
                duration: 0.3,
                times: [0, 0.2, 0.5, 1],
                delay: CLICK - 0.05,
              },
              opacity: { duration: 1.6, times: [0, 0.1, 0.75, 1] },
            }
          : { duration: DUR.fast }
      }
    >
      <IconPointerFilled size={30} />
    </m.div>
  );
}

export function Slide06Automerge() {
  const step = useDeckStep();
  const running = step >= 1;
  const sleeping = step >= 2;

  return (
    <Shell className="py-14">
      <Title size="md">Changes that ship themselves.</Title>

      <div className="my-auto pb-6">
        <m.div
          className="relative flex items-stretch"
          animate={{ opacity: sleeping ? 0.6 : 1, scale: sleeping ? 0.98 : 1 }}
          transition={cueTransition(sleeping, 0, {
            duration: DUR.slow,
            ease: EASE.out,
          })}
        >
          <PipelineNode
            icon={<IconGitPullRequestDraft size={ICON_SIZE} />}
            label="Eva drafts the change"
            active
            delay={0.5}
          />
          <PipelineConnector active delay={0.95} />
          <PipelineNode
            icon={<IconHandClick size={ICON_SIZE} />}
            label="You mark it ready"
            active
            delay={1.15}
            glow
            pulse={!running}
            pressed={running}
            pressAt={CLICK - 0.05}
          />
          <PipelineConnector active={running} delay={at(0)} />
          <PipelineNode
            icon={<GrokMark size={ICON_SIZE} className="text-white" />}
            label="Grok bot wakes up"
            active={running}
            delay={at(0) + 0.3}
            step={1}
          />
          <PipelineConnector active={running} delay={at(1)} />
          <PipelineNode
            icon={<IconGitMerge size={ICON_SIZE} />}
            label="Merged into main"
            active={running}
            delay={at(1) + 0.3}
            step={1}
          />
          <PipelineConnector active={running} delay={at(2)} />
          <PipelineNode
            icon={<IconRocket size={ICON_SIZE} />}
            label="Live in production"
            active={running}
            delay={at(2) + 0.3}
            step={1}
            flash
          />
          <Cursor />
        </m.div>

        <Reveal step={2} className="mt-10" distance={24}>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white/85">
              <m.span
                className="inline-flex"
                initial={{ rotate: -40, opacity: 0 }}
                animate={
                  sleeping
                    ? { rotate: 0, opacity: 1 }
                    : { rotate: -40, opacity: 0 }
                }
                transition={cueTransition(sleeping, 0.2, {
                  duration: DUR.hero,
                  ease: EASE.expo,
                })}
              >
                <IconMoonStars size={18} />
              </m.span>
              And while you sleep
            </div>
            <Stagger
              step={2}
              delayChildren={0.3}
              staggerChildren={0.06}
              className="mt-3 flex flex-wrap gap-2"
            >
              {ROUTINES.map((routine) => (
                <StaggerItem
                  key={routine}
                  className="rounded-full bg-white/[0.07] px-3 py-1 text-sm"
                >
                  {routine}
                </StaggerItem>
              ))}
            </Stagger>
          </Card>
        </Reveal>
      </div>
    </Shell>
  );
}
