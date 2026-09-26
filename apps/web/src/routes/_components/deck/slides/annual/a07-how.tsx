import type { Icon } from "@tabler/icons-react";
import {
  IconChecks,
  IconCloudComputing,
  IconMessage,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Card,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";

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

const TRACK_W = 1038;
const DRAW = 1.5;
/**
 * When the drawing tip passes under each card's centre. The draw runs on
 * `EASE.inOut`, which reaches 16%, 50% and 84% of the line at about 30%, 50%
 * and 70% of its duration.
 */
const PASS_AT = [0.3, 0.5, 0.7].map((share) => share * DRAW);

function StageCard({ stage, index }: { stage: Stage; index: number }) {
  const lit = useDeckStep() >= 1;
  const at = PASS_AT[index] ?? 0;

  return (
    // p-8 inside a 32px outer radius keeps the corners concentric.
    <Card className="flex h-[220px] w-[330px] flex-col rounded-[32px] p-8">
      <m.div
        className="w-fit origin-left"
        initial={{ color: "rgba(255,255,255,0.7)", scale: 1 }}
        animate={
          lit
            ? { color: BRAND.blue, scale: [1, 1.18, 1] }
            : { color: "rgba(255,255,255,0.7)", scale: 1 }
        }
        transition={
          lit
            ? {
                color: { duration: DUR.base, delay: at },
                scale: { duration: DUR.slow, times: [0, 0.4, 1], delay: at },
              }
            : { duration: DUR.fast }
        }
      >
        <stage.icon size={32} stroke={1.6} aria-hidden />
      </m.div>
      <div className="relative mt-auto text-5xl leading-none font-semibold tabular-nums">
        <m.span
          className="block text-white/25"
          animate={{ opacity: lit ? 0 : 1 }}
          transition={cueTransition(lit, at, { duration: DUR.base })}
        >
          {stage.number}
        </m.span>
        <m.span
          aria-hidden
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: lit ? 1 : 0 }}
          transition={cueTransition(lit, at, { duration: DUR.base })}
        >
          <Accent>{stage.number}</Accent>
        </m.span>
      </div>
      <div className="mt-4 text-3xl leading-tight font-semibold text-balance text-white">
        {stage.heading}
      </div>
    </Card>
  );
}

export function AnnualHow() {
  const step = useDeckStep();
  const flowing = step >= 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>In use · How it works</Kicker>
        <Title size="md" className="text-balance">
          Describe it. Eva builds it. Review it.
        </Title>
      </Reveal>

      <div className="mt-14" style={{ width: TRACK_W }}>
        <Stagger
          delayChildren={0.25}
          staggerChildren={0.1}
          className="relative flex gap-6"
        >
          {STAGES.map((stage, index) => (
            <StaggerItem key={stage.heading}>
              <StageCard stage={stage} index={index} />
            </StaggerItem>
          ))}
        </Stagger>

        {/* The flow line runs under the three cards: it draws left to right,
            lighting each stage as its tip passes, then work keeps moving. */}
        <div aria-hidden className="relative mt-6 h-2">
          <DrawPath
            d={`M0 4 L${TRACK_W} 4`}
            width={TRACK_W}
            height={8}
            step={1}
            duration={DRAW}
            strokeWidth={1.5}
            dot
          />
          {flowing ? (
            <m.span
              className="absolute top-0 left-0 size-2 rounded-full"
              style={{ background: BRAND_GRADIENT }}
              initial={{ x: 0, opacity: 0 }}
              animate={{ x: [0, TRACK_W - 8], opacity: [0, 1, 1, 0] }}
              transition={{
                duration: 2.6,
                ease: EASE.inOut,
                times: [0, 0.12, 0.88, 1],
                repeat: Infinity,
                repeatDelay: 0.6,
                delay: DRAW + 0.8,
              }}
            />
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-base text-white/55">
        <MaskedText step={1} delay={DRAW - 0.2} duration={DUR.slow}>
          The whole loop happens in a browser tab.
        </MaskedText>
      </p>

      <div className="mt-10 flex gap-3">
        {WAYS.map((way, index) => (
          <m.div
            key={way}
            initial={{ opacity: 0, y: 22, scale: 0.94 }}
            animate={
              step >= 2
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 22, scale: 0.94 }
            }
            transition={cueTransition(step >= 2, index * 0.08, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            <Sheen
              step={2}
              delay={0.45 + index * 0.08}
              className="rounded-full bg-white/[0.07] px-5 py-2.5 text-lg text-white/85"
            >
              {way}
            </Sheen>
          </m.div>
        ))}
      </div>
    </Shell>
  );
}
