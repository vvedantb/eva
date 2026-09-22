import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

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

const GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;
const LABEL = "text-xs uppercase tracking-[0.18em] text-white/35";
const BIG_NUMBER = "text-5xl font-semibold tracking-[-0.02em]";

/** The gradient thread that draws downwards between two lines of a case. */
function CaseLink({ delay }: { delay: number }) {
  return (
    <m.div
      aria-hidden
      className="h-8 w-px origin-top bg-gradient-to-b from-white/10 to-white/45"
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay }}
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
    <m.div
      className="text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay }}
    >
      <div className={LABEL}>{label}</div>
      <div className={cn("mt-2 leading-tight", textClass)}>{text}</div>
    </m.div>
  );
}

function CaseView({ item }: { item: Case }) {
  return (
    <m.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <span className="rounded-full bg-white/[0.07] px-4 py-1.5 text-xs tabular-nums text-white/55">
        {item.date}
      </span>
      <CaseLink delay={0.15} />
      <CaseLine
        label="Symptom"
        text={item.symptom}
        textClass="text-2xl text-white/60"
        delay={0.3}
      />
      <CaseLink delay={0.5} />
      <CaseLine
        label="Cause"
        text={item.cause}
        textClass="text-2xl font-medium text-white/95"
        delay={0.65}
      />
      <CaseLink delay={0.85} />
      <CaseLine
        label="Fix"
        text={item.fix}
        textClass="text-xl text-white/70"
        delay={1}
      />
    </m.div>
  );
}

function ClosingView() {
  return (
    <m.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <p className="text-center text-3xl leading-snug text-white/75">
        <span className={BIG_NUMBER}>
          <Accent>
            <CountUp value={65} step={3} duration={1.2} delay={0.3} />
          </Accent>
        </span>{" "}
        restarts against{" "}
        <span className={BIG_NUMBER}>
          <Accent>
            <CountUp value={146} step={3} duration={1.2} delay={0.3} />
          </Accent>
        </span>{" "}
        launches — found by searching live traffic.
      </p>
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
        <Kicker>Debugging</Kicker>
        <Title size="md">Symptom, cause, then a test.</Title>
      </Reveal>

      <div className="relative mt-10 h-[320px] w-full">
        <AnimatePresence>
          {item ? (
            <CaseView key={item.date} item={item} />
          ) : (
            <ClosingView key="closing" />
          )}
        </AnimatePresence>
      </div>

      <m.div
        className="mt-6 flex justify-center gap-2.5"
        animate={{ opacity: item ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        {CASES.map((entry, index) => (
          <m.span
            key={entry.date}
            className="h-1.5 rounded-full"
            style={{
              background: index === step ? GRADIENT : "rgba(255,255,255,0.18)",
            }}
            initial={{ width: 8 }}
            animate={{ width: index === step ? 26 : 8 }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
          />
        ))}
      </m.div>

      <Footnote>
        Written up in the project&apos;s release notes, August to September
        2026.
      </Footnote>
    </Shell>
  );
}
