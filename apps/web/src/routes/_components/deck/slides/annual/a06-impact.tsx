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

interface Shift {
  /** Build step this row arrives on. */
  step: number;
  label: string;
  before: string;
  after: string;
}

/** Top to bottom, in the order they are spoken. */
const SHIFTS: Shift[] = [
  {
    step: 1,
    label: "Who can ask",
    before: "A request, a queue, a developer",
    after: "Anyone describes what they need, in their own words",
  },
  {
    step: 2,
    label: "Where work runs",
    before: "One laptop, one person at a time",
    after: "Cloud workspaces, many jobs at once",
  },
  {
    step: 3,
    label: "What a person does",
    before: "Writing every line",
    after: "Directing the work and guarding what is hard to undo",
  },
];

export function AnnualImpact() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Impact</Kicker>
        <Title size="md">What it changed.</Title>
        <Body className="mt-4 max-w-4xl text-lg">
          Eva was built to remove the wait between someone needing something and
          it being built.
        </Body>
      </Reveal>

      <div className="mt-8 flex w-[1000px] flex-col gap-4">
        {SHIFTS.map((shift) => (
          <Reveal key={shift.label} step={shift.step}>
            <Card className="flex h-[90px] items-center gap-6 px-6 py-0">
              <div className="w-[150px] shrink-0 text-xs tracking-[0.18em] text-white/40 uppercase">
                {shift.label}
              </div>
              <div className="w-[260px] shrink-0 text-base text-white/45 line-through decoration-white/25">
                {shift.before}
              </div>
              <IconArrowRight
                size={18}
                className="shrink-0 text-[#3B7DD8]"
                aria-hidden
              />
              <div className="text-lg leading-snug text-white/90">
                {shift.after}
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal step={3} delay={0.3} className="mt-6">
        <p className="max-w-4xl text-base leading-relaxed text-white/60">
          13 people other than the developer have raised work in Eva. 390 pieces
          of that work were for CarePulse.
        </p>
      </Reveal>

      <Footnote>
        Counts from Eva&apos;s own records to 16 September 2026.
      </Footnote>
    </Shell>
  );
}
