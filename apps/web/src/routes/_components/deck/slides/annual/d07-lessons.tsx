import { m } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, MaskedText, Spotlight } from "../../_components/motion";

/** Verbatim from the project's written notes. */
const QUOTES: readonly string[] = [
  "Most failures are not model failures. They are system design failures.",
  "Autonomy is an infrastructure decision.",
];

/**
 * Each quote is set once, large, and only ever moved: on step 2 both shrink to
 * half size and glide into a pair. Half of the 900px measure is the 450px
 * column, so the lines wrap exactly as they did large.
 */
const MEASURE = 900;
const PAIR_X = 262;
const PAIR_Y = -58;

const CENTRE: TargetAndTransition = { x: 0, y: 0, scale: 1, opacity: 1 };
const GONE_UP: TargetAndTransition = { x: 0, y: -28, scale: 0.98, opacity: 0 };
const WAITING: TargetAndTransition = { x: 0, y: 0, scale: 1, opacity: 1 };
const paired = (side: -1 | 1): TargetAndTransition => ({
  x: side * PAIR_X,
  y: PAIR_Y,
  scale: 0.5,
  opacity: 0.62,
});

const GLIDE: Transition = { duration: DUR.hero + 0.2, ease: EASE.expo };
const EXIT: Transition = { duration: DUR.base, ease: EASE.in };

/** Glow behind the quote on screen, widening to hold both. The glow's box overhangs the stage by `GLOW_BLEED`. */
const GLOW_BLEED = { x: 96, y: 128 };
const GLOW = [
  { x: 544 + GLOW_BLEED.x, y: 200 + GLOW_BLEED.y, size: 520 },
  { x: 544 + GLOW_BLEED.x, y: 200 + GLOW_BLEED.y, size: 520 },
  { x: 544 + GLOW_BLEED.x, y: 180 + GLOW_BLEED.y, size: 640 },
];

function Quote({
  text,
  pose,
  transition,
  step,
  delay,
}: {
  text: string;
  pose: TargetAndTransition;
  transition: Transition;
  step: number;
  delay: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <m.blockquote
        className="text-center text-5xl leading-[1.15] font-medium tracking-[-0.02em] text-balance text-white"
        style={{ width: MEASURE }}
        initial={false}
        animate={pose}
        transition={transition}
      >
        <MaskedText step={step} delay={delay} stagger={0.06}>
          {text}
        </MaskedText>
      </m.blockquote>
    </div>
  );
}

export function AnnualLessons() {
  const step = useDeckStep();
  const pair = step >= 2;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>People · Lessons</Kicker>
        <Title size="md">Two lessons, one direction.</Title>
      </Reveal>

      <div className="relative isolate mt-6 h-[400px] w-full">
        <Spotlight shots={GLOW} className="-inset-x-24 -inset-y-32" />

        <Quote
          text={QUOTES[0]}
          step={0}
          delay={0.35}
          pose={pair ? paired(-1) : step === 1 ? GONE_UP : CENTRE}
          transition={step === 1 ? EXIT : GLIDE}
        />
        <Quote
          text={QUOTES[1]}
          step={1}
          delay={0.2}
          pose={pair ? paired(1) : WAITING}
          transition={GLIDE}
        />

        <div className="absolute inset-x-0 top-1/2 mt-[52px] text-center">
          <p className="text-3xl text-white/85">
            <MaskedText step={2} delay={0.75}>
              Both point the same way: <Accent>build the system</Accent>.
            </MaskedText>
          </p>
        </div>
      </div>

      <Footnote>From the project&apos;s own written notes.</Footnote>
    </Shell>
  );
}
