import type { Icon } from "@tabler/icons-react";
import {
  IconGauge,
  IconListDetails,
  IconToggleRight,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import {
  CountRoll,
  DUR,
  EASE,
  SETTLE,
  cueTransition,
} from "../../_components/motion";

export interface Fri3JevQuestion {
  kind: string;
  icon: Icon;
  label: string;
  /** Probability Jev returns, 0 to 100. */
  value: number;
  /** Vertical centre inside the diagram, so the wires can find the row. */
  y: number;
}

/** One of each question type. The answers are an illustration, not a real call. */
export const FRI3_JEV_QUESTIONS: readonly Fri3JevQuestion[] = [
  {
    kind: "Yes / no",
    icon: IconToggleRight,
    label: "A bug?",
    value: 92,
    y: 50,
  },
  {
    kind: "Pick one",
    icon: IconListDetails,
    label: "Area: screens",
    value: 81,
    y: 130,
  },
  { kind: "Score", icon: IconGauge, label: "Clear enough?", value: 28, y: 210 },
];

/** Eva acts above this line and leaves the item alone below it. */
const THRESHOLD = 60;
const ROW_H = 52;
const TRACK_W = 196;
/** Left edge of the bar tracks inside the panel: chip, gap, label, gap. */
const TRACK_X = 124 + 14 + 120 + 14;
/** Rows ask on step 1, answer on step 2, step back on step 3. */
const ASK = 1;
const ANSWER = 2;
const FAN = 3;

function Row({
  question,
  index,
}: {
  question: Fri3JevQuestion;
  index: number;
}) {
  const step = useDeckStep();
  const asked = step >= ASK;
  const answered = step >= ANSWER;
  const passes = question.value >= THRESHOLD;
  const at = 0.55 + index * 0.12;

  return (
    <m.div
      className="absolute left-0 flex items-center gap-[14px]"
      style={{ top: question.y - ROW_H / 2, height: ROW_H }}
      initial={{ opacity: 0, x: -12 }}
      animate={
        asked
          ? { opacity: step >= FAN ? 0.4 : 1, x: 0 }
          : { opacity: 0, x: -12 }
      }
      transition={
        step >= FAN
          ? { duration: DUR.slow, ease: EASE.out }
          : cueTransition(asked, at, SETTLE)
      }
    >
      <m.div
        className="relative flex h-9 w-[124px] items-center gap-2 overflow-hidden rounded-full px-3"
        initial={{ backgroundColor: "rgba(255,255,255,0.04)" }}
        animate={{
          backgroundColor: asked
            ? "rgba(255,255,255,0.1)"
            : "rgba(255,255,255,0.04)",
        }}
        transition={cueTransition(asked, at + 0.15, { duration: DUR.base })}
      >
        <m.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] origin-bottom"
          style={{
            background: `linear-gradient(180deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: asked ? 1 : 0 }}
          transition={cueTransition(asked, at + 0.15, SETTLE)}
        />
        <question.icon
          size={16}
          stroke={1.7}
          aria-hidden
          className="text-white/75"
        />
        <span className="text-[13px] whitespace-nowrap text-white/85">
          {question.kind}
        </span>
      </m.div>
      <span className="w-[120px] text-sm whitespace-nowrap text-white/60">
        {question.label}
      </span>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.07]"
        style={{ width: TRACK_W }}
      >
        <m.div
          className={cn(
            "absolute inset-y-0 left-0 origin-left rounded-full",
            !passes && "bg-white/25",
          )}
          style={{
            width: `${question.value}%`,
            background: passes
              ? `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`
              : undefined,
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: answered ? 1 : 0 }}
          transition={cueTransition(answered, 0.2 + index * 0.14, {
            duration: 1.2,
            ease: EASE.expo,
          })}
        />
      </div>
      <m.span
        className={cn(
          "w-12 text-right text-lg font-semibold tabular-nums",
          passes ? "text-white" : "text-white/40",
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: answered ? 1 : 0 }}
        transition={cueTransition(answered, 0.2 + index * 0.14, {
          duration: DUR.fast,
        })}
      >
        <CountRoll
          value={question.value}
          step={ANSWER}
          delay={0.2 + index * 0.14}
          duration={1.2}
          suffix="%"
        />
      </m.span>
    </m.div>
  );
}

/**
 * The three typed questions and the probabilities that come back, with the
 * threshold Eva acts on drawn through all three bars.
 */
export function Fri3JevAnswers({ left }: { left: number }) {
  const step = useDeckStep();
  const answered = step >= ANSWER;
  const lineX = TRACK_X + (TRACK_W * THRESHOLD) / 100;

  return (
    <div className="absolute inset-y-0" style={{ left, right: 0 }}>
      {FRI3_JEV_QUESTIONS.map((question, index) => (
        <Row key={question.kind} question={question} index={index} />
      ))}

      <m.div
        aria-hidden
        className="absolute w-px origin-top bg-white/50"
        style={{ left: lineX, top: 22, height: 216 }}
        initial={{ scaleY: 0 }}
        animate={{
          scaleY: answered ? 1 : 0,
          opacity: step >= FAN ? 0.3 : 1,
        }}
        transition={cueTransition(answered, 0, {
          duration: DUR.slow,
          ease: EASE.inOut,
        })}
      />
      <m.span
        className="absolute -translate-x-1/2 text-xs whitespace-nowrap text-white/45"
        style={{ left: lineX, top: 0 }}
        initial={{ opacity: 0, y: 4 }}
        animate={
          answered
            ? { opacity: step >= FAN ? 0.3 : 1, y: 0 }
            : { opacity: 0, y: 4 }
        }
        transition={cueTransition(answered, 0.3, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      >
        Act above {THRESHOLD}%
      </m.span>
    </div>
  );
}
