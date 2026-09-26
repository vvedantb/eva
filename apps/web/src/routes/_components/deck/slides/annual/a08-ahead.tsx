import type { Icon } from "@tabler/icons-react";
import {
  IconGitMerge,
  IconShieldLock,
  IconSparkles,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  CountRoll,
  DUR,
  EASE,
  Magnify,
  MaskedText,
  Pulse,
  Sheen,
  Spotlight,
} from "../../_components/motion";

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

const CARD_WIDTH = 330;
const CARD_HEIGHT = 170;
/** The glow's box overhangs the card row so its falloff is never clipped. */
const BLEED = 128;
const FIRST_STRAND = {
  x: BLEED + CARD_WIDTH / 2,
  y: BLEED + CARD_HEIGHT / 2,
  size: 460,
};

export function AnnualAhead() {
  const step = useDeckStep();
  const queued = step >= 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>The year ahead</Kicker>
        <Title size="md" className="text-balance">
          The bottleneck has moved.
        </Title>
      </Reveal>
      <Reveal delay={0.35}>
        <Body className="mt-5 max-w-3xl text-pretty">
          Eva finishes work faster than we can check it in.
        </Body>
      </Reveal>

      <div className="relative isolate mt-12">
        {/* The first strand lights as the queue figure arrives. */}
        <Spotlight shots={[null, FIRST_STRAND]} className="-inset-32" />
        <Magnify focus={queued ? 0 : null} dimTo={0.55} className="flex gap-6">
          {STRANDS.map((strand, index) => (
            <m.div
              key={strand.heading}
              style={{ width: CARD_WIDTH }}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: DUR.slow + 0.2,
                ease: EASE.expo,
                delay: 0.45 + index * 0.1,
              }}
            >
              {/* p-8 inside a 32px outer radius keeps the corners concentric. */}
              <Card className="flex flex-col rounded-[32px] p-8">
                <div
                  style={{ height: CARD_HEIGHT - 64 }}
                  className="flex flex-col"
                >
                  <strand.icon
                    size={28}
                    stroke={1.6}
                    className="text-white/70"
                    aria-hidden
                  />
                  <div className="mt-auto text-2xl leading-tight font-semibold text-balance text-white">
                    {strand.heading}
                  </div>
                </div>
              </Card>
            </m.div>
          ))}
        </Magnify>
      </div>

      <div className="mt-10 flex items-baseline gap-5">
        <Sheen step={1} delay={1.1} className="rounded-lg">
          <CountRoll
            value={176}
            step={1}
            delay={0.15}
            duration={1.4}
            className="text-6xl leading-none font-semibold tabular-nums text-white"
          />
        </Sheen>
        <Reveal step={1} delay={0.55} from="left" distance={12}>
          <div className="flex items-center gap-3 text-lg text-white/60">
            {/* The queue is live: it is still growing. */}
            <Pulse step={1} delay={1} rings={2} size={7} />
            waiting to be checked in
          </div>
        </Reveal>
      </div>

      <p className="mt-9 max-w-5xl text-3xl leading-snug text-pretty text-white/85">
        <MaskedText step={2} delay={0.1} stagger={0.05}>
          The question stops being <Accent>how fast can we build it</Accent> and
          becomes <Accent>how fast can we decide</Accent>.
        </MaskedText>
      </p>

      <Footnote>
        Quick task status across all 887 raised in Eva, at 16 September 2026.
      </Footnote>
    </Shell>
  );
}
