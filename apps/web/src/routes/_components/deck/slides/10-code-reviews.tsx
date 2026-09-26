import type { Icon } from "@tabler/icons-react";
import { IconRobot, IconShieldLock } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  DrawPath,
  EASE,
  LEAVE,
  MaskedText,
  Spotlight,
  cueTransition,
} from "../_components/motion";

/** The old way, one phrase a line. What each one meant lives in the notes. */
const BEFORE: readonly string[] = [
  "A person reads every line",
  "Comments back and forth",
  "Days waiting for a reviewer",
  "Small bugs still slip through",
  "Every change weighed the same",
];

interface Statement {
  icon: Icon;
  text: string;
}

/** The two halves of the new arrangement. The lists behind them are in the notes. */
const NOW: readonly Statement[] = [
  { icon: IconRobot, text: "Model reviews first" },
  { icon: IconShieldLock, text: "People guard the irreversible" },
];

/** The strike draws left to right, one line after the next. */
const STRIKE_STAGGER = 0.14;
const STRIKE_DRAW = 0.5;
const STRUCK_AT = STRIKE_STAGGER * 4 + STRIKE_DRAW;

/** The light moves from the new arrangement to the closing line. */
const LIGHT = [
  null,
  null,
  { x: 880, y: 320, size: 520 },
  { x: 500, y: 530, size: 640 },
];

function BeforeLine({
  text,
  index,
  struck,
}: {
  text: string;
  index: number;
  struck: boolean;
}) {
  return (
    <div className="relative w-fit">
      <MaskedText
        by="line"
        delay={0.35 + index * 0.09}
        className="text-[28px] leading-snug text-balance text-white/40"
      >
        {text}
      </MaskedText>
      <m.span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-[2px] origin-left rounded-full"
        style={{ background: BRAND_GRADIENT }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: struck ? 1 : 0 }}
        transition={cueTransition(struck, index * STRIKE_STAGGER, {
          duration: STRIKE_DRAW,
          ease: EASE.inOut,
        })}
      />
    </div>
  );
}

function NowStatement({
  statement,
  index,
  visible,
}: {
  statement: Statement;
  index: number;
  visible: boolean;
}) {
  const delay = 0.15 + index * 0.18;
  return (
    <div className="flex items-start gap-5">
      <m.span
        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B3FB8]/35 to-[#3B7DD8]/35"
        initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
        animate={
          visible
            ? { opacity: 1, scale: 1, rotate: 0 }
            : { opacity: 0, scale: 0.6, rotate: -8 }
        }
        transition={cueTransition(visible, delay, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        <statement.icon
          size={24}
          stroke={1.6}
          className="text-white"
          aria-hidden
        />
      </m.span>
      <div className="pt-0.5 text-4xl leading-tight font-semibold text-balance text-white">
        <MaskedText step={2} delay={delay + 0.08}>
          {statement.text}
        </MaskedText>
      </div>
    </div>
  );
}

export function Slide10CodeReviews() {
  const step = useDeckStep();
  const struck = step >= 1;

  return (
    <Shell className="isolate py-14">
      <Spotlight shots={LIGHT} />
      <Reveal>
        <Kicker>What&apos;s next · Code reviews</Kicker>
        <Title size="md">Let the model find the bugs.</Title>
      </Reveal>

      <div className="mt-14 grid grid-cols-[460px_1fr] gap-12">
        {/* Once every line is struck, the old lane recedes. */}
        <m.div
          className="flex origin-left flex-col gap-3.5"
          initial={false}
          animate={{
            opacity: step >= 3 ? 0.2 : struck ? 0.35 : 1,
            x: struck ? -12 : 0,
            scale: struck ? 0.97 : 1,
          }}
          transition={
            struck
              ? {
                  duration: DUR.slow,
                  ease: EASE.out,
                  delay: step >= 3 ? 0 : STRUCK_AT,
                }
              : LEAVE
          }
        >
          {BEFORE.map((line, index) => (
            <BeforeLine key={line} text={line} index={index} struck={struck} />
          ))}
        </m.div>

        <div className="relative flex flex-col gap-11">
          {NOW.map((statement, index) => (
            <NowStatement
              key={statement.text}
              statement={statement}
              index={index}
              visible={step >= 2}
            />
          ))}
          {/* One rail joins the two halves: they are one arrangement. */}
          <DrawPath
            d="M24 54 L24 88"
            width={48}
            height={140}
            step={2}
            delay={0.35}
            duration={0.6}
            strokeWidth={1.5}
            color={`${BRAND.blue}99`}
            className="pointer-events-none absolute top-0 left-0"
          />
        </div>
      </div>

      <div className="mt-14 text-3xl text-pretty text-white/85">
        <MaskedText step={3} delay={0.1} stagger={0.05}>
          The question is no longer <Accent>is this perfect</Accent>, it is{" "}
          <Accent>can we undo it</Accent>.
        </MaskedText>
      </div>

      <Footnote>
        The mechanics are the nightly routines and auto-merge, shown earlier.
      </Footnote>
    </Shell>
  );
}
