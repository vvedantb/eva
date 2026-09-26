import type { ReactNode } from "react";
import { m } from "motion/react";
import {
  Accent,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  Connector,
  DUR,
  EASE,
  LEAVE,
  MaskedText,
  SETTLE,
  Sheen,
} from "../../_components/motion";
import { MoF1AskPanel, MoF1BuildPanel } from "../_parts/MoF1Ask";
import { MoF1PreviewPanel } from "../_parts/MoF1AskPreview";

/** One panel per beat, left to right, in the order they are spoken. */
const STAGE_LABELS: readonly string[] = [
  "You ask",
  "Eva builds it",
  "You try it",
];

const PANEL_H = 268;
/** On the closing line, the sentence steps forward and the rest recede. */
const CLOSING_STEP = 3;

function useFocus(index: number): {
  scale: number;
  y: number;
  opacity: number;
} {
  const closing = useDeckStep() >= CLOSING_STEP;
  if (!closing) return { scale: 1, y: 0, opacity: 1 };
  return index === 0
    ? { scale: 1.04, y: -8, opacity: 1 }
    : { scale: 0.97, y: 4, opacity: 0.4 };
}

function Panel({ index, children }: { index: number; children: ReactNode }) {
  const landed = useDeckStep() >= index;
  const focus = useFocus(index);

  return (
    <m.div
      className="flex origin-left flex-col items-start"
      animate={focus}
      transition={SETTLE}
    >
      <m.div
        className="w-[300px]"
        style={{ height: PANEL_H }}
        initial={{ opacity: 0, y: 28, scale: 0.94 }}
        animate={
          landed
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: 28, scale: 0.94 }
        }
        transition={
          landed
            ? {
                duration: DUR.hero,
                ease: EASE.expo,
                opacity: { duration: DUR.base },
              }
            : LEAVE
        }
      >
        {/* Light crosses the glass once it has landed. */}
        <Sheen step={index} delay={0.45} className="h-full rounded-[20px]">
          {children}
        </Sheen>
      </m.div>
      <MaskedText
        step={index}
        delay={0.2}
        duration={DUR.slow}
        className="mt-4 block text-sm text-white/55"
      >
        {STAGE_LABELS[index]}
      </MaskedText>
    </m.div>
  );
}

/** The hand-off between beats: a line draws, then work keeps flowing along it. */
function Link({ step }: { step: number }) {
  const deckStep = useDeckStep();
  const on = deckStep >= step;
  // Hidden until its step: a round cap on an undrawn line still paints a dot.
  const opacity = !on ? 0 : deckStep >= CLOSING_STEP ? 0.4 : 1;
  return (
    <m.div
      aria-hidden
      className="relative w-10 shrink-0"
      style={{ height: PANEL_H }}
      animate={{ opacity }}
      transition={on ? { duration: DUR.fast } : LEAVE}
    >
      <Connector
        from={{ x: 2, y: PANEL_H / 2 }}
        to={{ x: 34, y: PANEL_H / 2 }}
        step={step}
        flowPeriod={0.7}
      />
      <m.svg
        width={10}
        height={12}
        viewBox="0 0 10 12"
        fill="none"
        className="absolute"
        style={{ left: 31, top: PANEL_H / 2 - 6 }}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: on ? 1 : 0, x: on ? 0 : -6 }}
        transition={
          on ? { duration: DUR.base, ease: EASE.out, delay: 0.55 } : LEAVE
        }
      >
        <path
          d="M2 1.5 L7.5 6 L2 10.5"
          stroke="#3B7DD8"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </m.svg>
    </m.div>
  );
}

export function FridayAsk() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Using Eva · Asking</Kicker>
        <Title size="md">Say what you want.</Title>
      </Reveal>

      <div className="mt-10 flex items-start gap-3">
        <Panel index={0}>
          <MoF1AskPanel />
        </Panel>
        <Link step={1} />
        <Panel index={1}>
          <MoF1BuildPanel />
        </Panel>
        <Link step={2} />
        <Panel index={2}>
          <MoF1PreviewPanel />
        </Panel>
      </div>

      <p className="mt-11 text-3xl text-pretty text-white/85">
        <MaskedText step={CLOSING_STEP} delay={0.15}>
          No forms. No tickets. <Accent>A sentence.</Accent>
        </MaskedText>
      </p>
    </Shell>
  );
}
