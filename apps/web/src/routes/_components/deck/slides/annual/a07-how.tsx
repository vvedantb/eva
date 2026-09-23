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
  number: string;
  heading: string;
}

/** Left to right: the whole loop, once. What each stage involves is in the notes. */
const STAGES: Stage[] = [
  { icon: IconMessage, number: "1", heading: "You describe it" },
  { icon: IconCloudComputing, number: "2", heading: "Eva builds it" },
  { icon: IconChecks, number: "3", heading: "You review it" },
];

/** Names only. The difference between them is a speaking point, not a slide. */
const WAYS = ["Sessions", "Quick tasks", "Projects", "Automations"];

const BRAND_GRADIENT = "bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]";

export function AnnualHow() {
  const step = useDeckStep();
  const flowing = step >= 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>How it works</Kicker>
        <Title size="md" className="text-balance">
          Describe it. Watch it. Review it.
        </Title>
      </Reveal>

      <div className="mt-14 w-[1038px]">
        <Stagger
          delayChildren={0.25}
          staggerChildren={0.1}
          className="relative flex gap-6"
        >
          {STAGES.map((stage) => (
            <StaggerItem key={stage.heading}>
              {/* p-8 inside a 32px outer radius keeps the corners concentric. */}
              <Card className="flex h-[220px] w-[330px] flex-col rounded-[32px] p-8">
                <stage.icon
                  size={32}
                  stroke={1.6}
                  className="text-white/70"
                  aria-hidden
                />
                <div className="mt-auto text-5xl leading-none font-semibold tabular-nums text-white/25">
                  {stage.number}
                </div>
                <div className="mt-4 text-3xl leading-tight font-semibold text-balance text-white">
                  {stage.heading}
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>

        {/* The flow line runs under the three cards, so the loop reads as one
            left-to-right move without crossing the card text. */}
        <div aria-hidden className="relative mt-6 h-2">
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

      <Reveal step={1} delay={0.5} className="mt-4">
        <p className="text-base text-white/55">
          The whole loop happens in a browser tab.
        </p>
      </Reveal>

      <div className="mt-10 flex gap-3">
        {WAYS.map((way, index) => (
          <m.div
            key={way}
            className="rounded-full bg-white/[0.07] px-5 py-2.5 text-lg text-white/85"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={
              step >= 2
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 14, scale: 0.94 }
            }
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.55,
              delay: step >= 2 ? index * 0.08 : 0,
            }}
          >
            {way}
          </m.div>
        ))}
      </div>
    </Shell>
  );
}
