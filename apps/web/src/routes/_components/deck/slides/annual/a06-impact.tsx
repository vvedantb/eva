import { IconArrowRight } from "@tabler/icons-react";
import { m } from "motion/react";
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
import {
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  Spotlight,
  cueTransition,
} from "../../_components/motion";

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

/**
 * Where a row's after-text starts, measured from its 32px inset: the 330px
 * before-column, a 32px gap, the 24px arrow and another 32px gap. Keep it in
 * step with the row's `w-[330px]` and `gap-8`.
 */
const ARROW_W = 24;
const AFTER_COLUMN_X = 330 + 32 + ARROW_W + 32;

/** Row centres on the 1280×720 stage, under the after-column: a light per step. */
const LIGHT = [
  null,
  { x: 800, y: 225, size: 560 },
  { x: 800, y: 336, size: 560 },
  { x: 800, y: 447, size: 560 },
];

/** Within a row's step: the old way is struck out, then the new way rises. */
const STRIKE_AT = 0.3;
const ARROW_AT = 0.55;
const AFTER_AT = 0.65;

function ShiftRow({ shift }: { shift: Shift }) {
  const arrived = useDeckStep() >= shift.step;

  return (
    <Reveal step={shift.step} distance={20}>
      {/* 32px gutters inside a 32px outer radius, so the row reads as one
          block rather than a label stuck to a card edge. */}
      <Card className="flex h-[96px] items-center gap-8 rounded-[32px] px-8 py-0">
        <div className="w-[330px] shrink-0 text-xl">
          <m.span
            className="relative inline-block"
            initial={{ color: "rgba(255,255,255,0.7)" }}
            animate={{
              color: arrived
                ? "rgba(255,255,255,0.4)"
                : "rgba(255,255,255,0.7)",
            }}
            transition={cueTransition(arrived, STRIKE_AT + 0.1, {
              duration: DUR.slow,
              ease: EASE.out,
            })}
          >
            {shift.before}
            <m.span
              aria-hidden
              className="absolute inset-x-0 top-[55%] h-px origin-left bg-white/45"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: arrived ? 1 : 0 }}
              transition={cueTransition(arrived, STRIKE_AT, {
                duration: DUR.slow,
                ease: EASE.inOut,
              })}
            />
          </m.span>
        </div>
        <m.div
          aria-hidden
          className="shrink-0 text-[#3B7DD8]"
          initial={{ opacity: 0, x: -14 }}
          animate={arrived ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
          transition={cueTransition(arrived, ARROW_AT, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        >
          <IconArrowRight size={ARROW_W} stroke={1.8} />
        </m.div>
        <div className="text-3xl leading-snug font-medium text-balance text-white">
          <MaskedText delay={AFTER_AT}>{shift.after}</MaskedText>
        </div>
      </Card>
    </Reveal>
  );
}

export function AnnualImpact() {
  return (
    <Shell className="isolate py-12">
      <Spotlight shots={LIGHT} />
      <Reveal>
        <Kicker>In use · Impact</Kicker>
        <Title size="md" className="text-balance">
          Not faster typing. A different job.
        </Title>
      </Reveal>

      <div className="mt-10 flex w-[1040px] flex-col gap-4">
        {SHIFTS.map((shift) => (
          <ShiftRow key={shift.after} shift={shift} />
        ))}
      </div>

      {/* Same insets as a row: the 13 sits under the before-column, the 390
          under the after-column, so both read as part of the grid above. */}
      <Reveal step={3} delay={0.9} className="mt-8 w-[1040px]">
        <div className="flex px-8">
          <div style={{ width: AFTER_COLUMN_X }}>
            <div className="text-6xl leading-none font-semibold tabular-nums">
              <Accent>
                <CountRoll value={13} step={3} duration={1.3} delay={1} />
              </Accent>
            </div>
            <div className="mt-3 text-base text-white/50">colleagues</div>
          </div>
          <div>
            <div className="text-6xl leading-none font-semibold tabular-nums text-white">
              <CountRoll value={390} step={3} duration={1.3} delay={1.1} />
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
