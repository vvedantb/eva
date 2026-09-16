import { IconArrowRight } from "@tabler/icons-react";
import {
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";

interface Case {
  /** Build step this row arrives on. */
  step: number;
  symptom: string;
  cause: string;
  fix: string;
  date: string;
}

/** Newest first, in the order they are spoken. */
const CASES: readonly Case[] = [
  {
    step: 1,
    symptom: "Signing out of a preview left you signed in",
    cause: "Two cookies with the same name: the browser sent both",
    fix: "Delete the old one before setting the new one",
    date: "10 Sep",
  },
  {
    step: 2,
    symptom: "Messages sat unanswered for two hours",
    cause:
      "A stuck process held a lock while a watchdog kept extending its deadline",
    fix: "Three separate defects, each pinned by its own test",
    date: "2 Sep",
  },
  {
    step: 3,
    symptom: "A three-minute wait before an agent replied",
    cause:
      "Not the workspace starting: it resumed in eight seconds. A stale model setting held the queue",
    fix: "Losers wait for the lock, re-check, then restart",
    date: "24 Aug",
  },
];

const COLUMN_LABEL =
  "text-[11px] uppercase tracking-[0.16em] text-white/35 leading-none";

function Column({
  label,
  text,
  width,
  textClass,
}: {
  label: string;
  text: string;
  width: number;
  textClass: string;
}) {
  return (
    <div className="shrink-0" style={{ width }}>
      <div className={COLUMN_LABEL}>{label}</div>
      <div className={`mt-2 text-sm leading-snug ${textClass}`}>{text}</div>
    </div>
  );
}

function Arrow() {
  return (
    <IconArrowRight
      size={16}
      className="shrink-0 self-center text-white/25"
      aria-hidden
    />
  );
}

export function AnnualDebugging() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Debugging</Kicker>
        <Title size="md">Symptom, cause, then a test.</Title>
        <Body className="mt-3 max-w-4xl text-lg">
          Every live problem gets written up the same way: what people saw, what
          was actually wrong, and what stops it coming back.
        </Body>
      </Reveal>

      <div className="mt-6 flex w-[1010px] flex-col gap-3">
        {CASES.map((item) => (
          <Reveal key={item.date} step={item.step}>
            <Card className="flex h-[110px] items-center gap-3 px-6 py-0">
              <Column
                label="Symptom"
                text={item.symptom}
                width={250}
                textClass="text-white/60"
              />
              <Arrow />
              <Column
                label="Cause"
                text={item.cause}
                width={310}
                textClass="text-white/85"
              />
              <Arrow />
              <Column
                label="Fix"
                text={item.fix}
                width={215}
                textClass="text-white/70"
              />
              <span className="ml-auto shrink-0 self-center rounded-full bg-white/[0.07] px-3 py-1 text-xs tabular-nums text-white/55">
                {item.date}
              </span>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal step={3} delay={0.3} className="mt-5">
        <p className="max-w-[1010px] text-base leading-relaxed text-white/60">
          Live traffic is searchable, so these start from evidence rather than a
          guess. One investigation began with 65 restarts against 146 launches
          in a day.
        </p>
      </Reveal>

      <Footnote>
        Written up in the project&apos;s release notes, August to September
        2026.
      </Footnote>
    </Shell>
  );
}
