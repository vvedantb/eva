import type { Icon } from "@tabler/icons-react";
import { IconRobot, IconShieldLock } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";

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
const STRIKE_STAGGER = 0.12;

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
      <span className="text-[28px] leading-snug text-balance text-white/40">
        {text}
      </span>
      <m.span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px origin-left rounded-full bg-white/50"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: struck ? 1 : 0 }}
        transition={{
          duration: struck ? 0.35 : 0.2,
          ease: EASE_OUT,
          delay: struck ? index * STRIKE_STAGGER : 0,
        }}
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
  const shown = { opacity: 1, y: 0, filter: "blur(0px)" };
  const hidden = { opacity: 0, y: 18, filter: "blur(8px)" };

  return (
    <m.div
      initial={hidden}
      animate={visible ? shown : hidden}
      transition={{
        duration: visible ? 0.55 : 0.3,
        ease: EASE_OUT,
        delay: visible ? index * 0.1 : 0,
      }}
    >
      <statement.icon
        size={28}
        stroke={1.6}
        className="text-white/60"
        aria-hidden
      />
      <div className="mt-4 text-4xl leading-tight font-semibold text-balance text-white">
        {statement.text}
      </div>
    </m.div>
  );
}

export function Slide10CodeReviews() {
  const step = useDeckStep();
  const struck = step >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Code reviews</Kicker>
        <Title size="md">Let the model find the bugs.</Title>
      </Reveal>

      <div className="mt-14 grid grid-cols-[520px_1fr] gap-20">
        <m.div
          initial={{ opacity: 1 }}
          animate={{ opacity: struck ? 0.3 : 1 }}
          transition={{
            duration: 0.5,
            ease: EASE_OUT,
            delay: struck ? 0.8 : 0,
          }}
        >
          <Stagger
            delayChildren={0.35}
            staggerChildren={0.09}
            className="flex flex-col gap-3.5"
          >
            {BEFORE.map((line, index) => (
              <StaggerItem key={line} className="w-fit">
                <BeforeLine text={line} index={index} struck={struck} />
              </StaggerItem>
            ))}
          </Stagger>
        </m.div>

        <div className="flex flex-col gap-11">
          {NOW.map((statement, index) => (
            <NowStatement
              key={statement.text}
              statement={statement}
              index={index}
              visible={step >= 2}
            />
          ))}
        </div>
      </div>

      <Reveal step={3} className="mt-14">
        <p className="text-3xl text-pretty text-white/85">
          The question is no longer <Accent>is this perfect</Accent>, it is{" "}
          <Accent>can we undo it</Accent>.
        </p>
      </Reveal>

      <Footnote>
        Mechanics on slide 6: the nightly review routines and auto-merge.
      </Footnote>
    </Shell>
  );
}
