import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  Sheen,
} from "../../_components/motion";
import { MoA3DebugClosing, MoA3DebugPager } from "../_parts/MoA3DebugClose";

interface Case {
  date: string;
  symptom: string;
  cause: string;
  fix: string;
}

/** Newest first, in the order they are spoken: one per build step. */
const CASES: readonly Case[] = [
  {
    date: "10 Sep",
    symptom: "Signed out, still signed in",
    cause: "Two cookies, same name",
    fix: "Delete the old one first",
  },
  {
    date: "2 Sep",
    symptom: "Two hours, no reply",
    cause: "A stuck process held the lock",
    fix: "Three defects, three tests",
  },
  {
    date: "24 Aug",
    symptom: "A three-minute wait",
    cause: "Not the workspace — a stale setting",
    fix: "Wait, re-check, restart",
  },
];

const LABEL = "text-xs uppercase tracking-[0.18em] text-white/35";
const ENTER = { duration: DUR.hero, ease: EASE.expo };
const EXIT = { duration: DUR.base, ease: EASE.in };
const LINK_H = 32;

/** The thread that draws down between two lines of a case, a light riding its tip. */
function CaseLink({ delay }: { delay: number }) {
  return (
    <DrawPath
      d={`M1 0 L1 ${LINK_H}`}
      width={2}
      height={LINK_H}
      delay={delay}
      duration={0.4}
      strokeWidth={1}
      color="rgba(255,255,255,0.4)"
      dot
    />
  );
}

function CaseLine({
  label,
  text,
  textClass,
  delay,
}: {
  label: string;
  text: string;
  textClass: string;
  delay: number;
}) {
  return (
    <div className="text-center">
      <m.div
        className={LABEL}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE.out, delay }}
      >
        {label}
      </m.div>
      <MaskedText
        delay={delay + 0.08}
        className={cn("mt-2 block leading-tight", textClass)}
      >
        {text}
      </MaskedText>
    </div>
  );
}

function CaseView({ item }: { item: Case }) {
  return (
    <m.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, transition: ENTER }}
      exit={{ opacity: 0, y: -10, transition: EXIT }}
    >
      <m.span
        className="rounded-full bg-white/[0.07] px-4 py-1.5 text-xs tabular-nums text-white/55"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DUR.slow, ease: EASE.expo, delay: 0.1 }}
      >
        {item.date}
      </m.span>
      <CaseLink delay={0.2} />
      <CaseLine
        label="Symptom"
        text={item.symptom}
        textClass="text-2xl text-white/60"
        delay={0.5}
      />
      <CaseLink delay={0.8} />
      {/* The cause is the point of each case: it lands brightest and catches the light. */}
      <Sheen delay={1.6} className="-mx-4 rounded-lg px-4">
        <CaseLine
          label="Cause"
          text={item.cause}
          textClass="text-2xl font-medium text-white/95"
          delay={1.1}
        />
      </Sheen>
      <CaseLink delay={1.45} />
      <CaseLine
        label="Fix"
        text={item.fix}
        textClass="text-xl text-white/70"
        delay={1.75}
      />
    </m.div>
  );
}

export function AnnualDebugging() {
  const step = useDeckStep();
  // `.at` is typed as possibly undefined: step 3 has no case, it has the close.
  const item = CASES.at(step);

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Debugging</Kicker>
        <Title size="md">Symptom, cause, then a test.</Title>
      </Reveal>

      <div className="relative mt-10 h-[340px] w-full">
        <AnimatePresence>
          {item ? (
            <CaseView key={item.date} item={item} />
          ) : (
            <MoA3DebugClosing key="closing" />
          )}
        </AnimatePresence>
      </div>

      <MoA3DebugPager
        count={CASES.length}
        step={step}
        visible={item !== undefined}
      />

      <Footnote>
        Written up in the project&apos;s release notes, August to September
        2026.
      </Footnote>
    </Shell>
  );
}
