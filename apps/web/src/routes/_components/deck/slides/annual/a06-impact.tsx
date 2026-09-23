import { IconArrowRight } from "@tabler/icons-react";
import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Shift {
  /** Build step this row arrives on. */
  step: number;
  before: string;
  after: string;
}

/**
 * Top to bottom, in the order they are spoken. The before-phrase says which
 * part of the job changed, so the rows carry no category label.
 */
const SHIFTS: Shift[] = [
  {
    step: 1,
    before: "A request, a queue, a developer",
    after: "Anyone describes what they need",
  },
  {
    step: 2,
    before: "One laptop at a time",
    after: "Cloud workspaces, many jobs at once",
  },
  {
    step: 3,
    before: "Writing every line",
    after: "Directing the work",
  },
];

function ShiftRow({ shift }: { shift: Shift }) {
  const arrived = useDeckStep() >= shift.step;

  return (
    <Reveal step={shift.step}>
      {/* 32px gutters inside a 32px outer radius, so the row reads as one
          block rather than a label stuck to a card edge. */}
      <Card className="flex h-[96px] items-center gap-8 rounded-[32px] px-8 py-0">
        <div className="w-[330px] shrink-0 text-xl text-white/40 line-through decoration-white/25">
          {shift.before}
        </div>
        <m.div
          aria-hidden
          className="shrink-0 text-[#3B7DD8]"
          initial={{ opacity: 0, x: -10 }}
          animate={arrived ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
          transition={{ type: "spring", bounce: 0, duration: 0.5, delay: 0.18 }}
        >
          <IconArrowRight size={24} stroke={1.8} />
        </m.div>
        <div className="text-3xl leading-snug font-medium text-balance text-white">
          {shift.after}
        </div>
      </Card>
    </Reveal>
  );
}

export function AnnualImpact() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Impact</Kicker>
        <Title size="md" className="text-balance">
          What it changed.
        </Title>
      </Reveal>

      <div className="mt-10 flex w-[1040px] flex-col gap-4">
        {SHIFTS.map((shift) => (
          <ShiftRow key={shift.after} shift={shift} />
        ))}
      </div>

      <Reveal step={3} delay={0.45} className="mt-8">
        <div className="flex">
          <div className="w-[330px]">
            <div className="text-6xl leading-none font-semibold tabular-nums">
              <Accent>
                <CountUp value={13} step={3} delay={0.45} />
              </Accent>
            </div>
            <div className="mt-3 text-base text-white/50">colleagues</div>
          </div>
          <div>
            <div className="text-6xl leading-none font-semibold tabular-nums text-white">
              <CountUp value={390} step={3} delay={0.6} />
            </div>
            <div className="mt-3 text-base text-white/50">for CarePulse</div>
          </div>
        </div>
      </Reveal>

      <Footnote>
        Counts from Eva&apos;s own records to 16 September 2026.
      </Footnote>
    </Shell>
  );
}
