import type { Icon } from "@tabler/icons-react";
import {
  IconGitMerge,
  IconShieldLock,
  IconSparkles,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Body,
  Card,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Strand {
  icon: Icon;
  heading: string;
}

/** Left to right, in priority order. What each one means is in the notes. */
const STRANDS: Strand[] = [
  { icon: IconGitMerge, heading: "Automate the release" },
  { icon: IconShieldLock, heading: "Guard the irreversible" },
  { icon: IconSparkles, heading: "Software that fits us" },
];

const BRAND_GRADIENT = "bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]";

export function AnnualAhead() {
  const highlighted = useDeckStep() >= 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>The year ahead</Kicker>
        <Title size="md" className="text-balance">
          The bottleneck has moved.
        </Title>
        <Body className="mt-5 max-w-3xl text-pretty">
          Eva finishes work faster than we can check it in.
        </Body>
      </Reveal>

      <Stagger
        delayChildren={0.3}
        staggerChildren={0.1}
        className="mt-12 flex gap-6"
      >
        {STRANDS.map((strand, index) => (
          <StaggerItem key={strand.heading}>
            <div className="relative w-[330px]">
              <m.div
                aria-hidden
                className={`pointer-events-none absolute -inset-2 rounded-[32px] blur-2xl ${BRAND_GRADIENT}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: highlighted && index === 0 ? 0.3 : 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              />
              {/* p-8 inside a 32px outer radius keeps the corners concentric. */}
              <Card className="relative flex h-[170px] flex-col rounded-[32px] p-8">
                <strand.icon
                  size={28}
                  stroke={1.6}
                  className="text-white/70"
                  aria-hidden
                />
                <div className="mt-auto text-2xl leading-tight font-semibold text-balance text-white">
                  {strand.heading}
                </div>
              </Card>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} delay={0.2} className="mt-10">
        <div className="flex items-baseline gap-5">
          <CountUp
            value={176}
            step={1}
            delay={0.2}
            className="text-6xl leading-none font-semibold tabular-nums text-white"
          />
          <div className="text-lg text-white/60">waiting to be checked in</div>
        </div>
      </Reveal>

      <Reveal step={2} className="mt-9">
        <p className="max-w-5xl text-3xl leading-snug text-pretty text-white/85">
          The question stops being <Accent>how fast can we build it</Accent> and
          becomes <Accent>how fast can we decide</Accent>.
        </p>
      </Reveal>

      <Footnote>
        Quick task status across all 887 raised in Eva, at 16 September 2026.
      </Footnote>
    </Shell>
  );
}
