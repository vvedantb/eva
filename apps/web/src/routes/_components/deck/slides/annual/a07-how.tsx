import type { Icon } from "@tabler/icons-react";
import {
  IconChecks,
  IconCloudComputing,
  IconMessage,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Card,
  EASE_OUT,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Stage {
  icon: Icon;
  heading: string;
  line: string;
}

/** Left to right: the whole loop, once. */
const STAGES: Stage[] = [
  {
    icon: IconMessage,
    heading: "1 · You describe it",
    line: "Plain English, in a chat. No forms, no tickets.",
  },
  {
    icon: IconCloudComputing,
    heading: "2 · Eva builds it",
    line: "In its own cloud workspace, with a live preview you can click through.",
  },
  {
    icon: IconChecks,
    heading: "3 · You review it",
    line: "Try it, ask for changes, then it goes live.",
  },
];

const WAYS = [
  "Sessions — a running conversation",
  "Quick tasks — one job, start to finish",
  "Projects — several jobs in order",
  "Automations — jobs that run themselves",
];

const BRAND_GRADIENT = "bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]";

export function AnnualHow() {
  const flowing = useDeckStep() >= 1;

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>How it works</Kicker>
        <Title size="md">Describe it. Watch it. Review it.</Title>
      </Reveal>

      <div className="mt-8 w-[1038px]">
        <Stagger
          delayChildren={0.25}
          staggerChildren={0.1}
          className="relative flex gap-6"
        >
          {STAGES.map((stage) => (
            <StaggerItem key={stage.heading}>
              <Card className="flex h-[200px] w-[330px] flex-col p-7">
                <stage.icon size={30} stroke={1.6} className="text-white/70" />
                <div className="mt-6 text-2xl leading-tight font-semibold text-white">
                  {stage.heading}
                </div>
                <div className="mt-3 text-base leading-snug text-white/60">
                  {stage.line}
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>

        {/* The flow line runs under the three cards, so the loop reads as one
            left-to-right move without crossing the card text. */}
        <div aria-hidden className="relative mt-5 h-2">
          <m.div
            className={`absolute top-1/2 h-px w-full origin-left ${BRAND_GRADIENT}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: flowing ? 1 : 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT }}
          />
          {flowing ? (
            <m.div
              className={`absolute top-1/2 size-2 -translate-y-1/2 rounded-full ${BRAND_GRADIENT}`}
              initial={{ left: "0%", opacity: 0 }}
              animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.6,
              }}
            />
          ) : null}
        </div>
      </div>

      <Reveal step={1} delay={0.5} className="mt-3">
        <p className="text-sm text-white/55">
          The whole loop happens in a browser tab.
        </p>
      </Reveal>

      <Reveal step={2} className="mt-6">
        <Card className="w-[1038px] p-5">
          <Stagger
            step={2}
            staggerChildren={0.08}
            className="flex flex-wrap gap-2"
          >
            {WAYS.map((way) => (
              <StaggerItem
                key={way}
                className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-white/80"
              >
                {way}
              </StaggerItem>
            ))}
          </Stagger>
          <div className="mt-3 text-xs text-white/45">
            Four ways to ask, depending on how big the job is.
          </div>
        </Card>
      </Reveal>
    </Shell>
  );
}
