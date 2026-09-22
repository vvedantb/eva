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
  line: string;
}

/** Left to right, in priority order. */
const STRANDS: Strand[] = [
  {
    icon: IconGitMerge,
    heading: "Automate the release",
    line: "Marking work ready should be the last human step, as it already is for Eva itself.",
  },
  {
    icon: IconShieldLock,
    heading: "Guard the irreversible",
    line: "People concentrate on data, permissions and anything hard to undo.",
  },
  {
    icon: IconSparkles,
    heading: "Software that fits us",
    line: "Tools shaped around how we work, not the other way round.",
  },
];

const BRAND_GRADIENT = "bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]";

export function AnnualAhead() {
  const highlighted = useDeckStep() >= 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>The year ahead</Kicker>
        <Title size="md">The bottleneck has moved.</Title>
        <Body className="mt-4 max-w-4xl text-lg">
          Eva now finishes work faster than we can check it in. The next year is
          about the steps either side of the building.
        </Body>
      </Reveal>

      <Stagger
        delayChildren={0.3}
        staggerChildren={0.1}
        className="mt-8 flex gap-6"
      >
        {STRANDS.map((strand, index) => (
          <StaggerItem key={strand.heading}>
            <div className="relative w-[330px]">
              <m.div
                aria-hidden
                className={`pointer-events-none absolute -inset-2 rounded-[24px] blur-2xl ${BRAND_GRADIENT}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: highlighted && index === 0 ? 0.3 : 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              />
              <Card className="relative flex h-[190px] flex-col p-6">
                <strand.icon size={26} stroke={1.6} className="text-white/70" />
                <div className="mt-4 text-lg leading-tight font-semibold text-white">
                  {strand.heading}
                </div>
                <div className="mt-2 text-sm leading-snug text-white/60">
                  {strand.line}
                </div>
              </Card>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} delay={0.2} className="mt-6">
        <div className="flex w-[700px] items-center gap-5">
          <CountUp
            value={176}
            step={1}
            delay={0.2}
            className="text-4xl font-semibold tabular-nums text-white"
          />
          <div>
            <div className="text-base leading-snug text-white/75">
              pieces of finished work waiting to be checked in
            </div>
            <div className="mt-1 text-xs text-white/45">
              against 455 already finished
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal step={2} className="mt-6">
        <p className="max-w-5xl text-xl leading-snug text-white/85">
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
