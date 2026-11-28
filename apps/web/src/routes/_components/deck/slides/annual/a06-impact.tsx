import { IconArrowRight } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Card,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  DUR,
  EASE,
  MaskedText,
  Spotlight,
  cueTransition,
} from "../../_components/motion";

interface Shift {
  step: number;
  before: string;
  after: string;
}

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

const ARROW_W = 24;

const LIGHT = [
  null,
  { x: 800, y: 225, size: 560 },
  { x: 800, y: 336, size: 560 },
  { x: 800, y: 447, size: 560 },
];

const STRIKE_AT = 0.3;
const ARROW_AT = 0.55;
const AFTER_AT = 0.65;

function ShiftRow({ shift }: { shift: Shift }) {
  const arrived = useDeckStep() >= shift.step;

  return (
    <Reveal step={shift.step} distance={20}>
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
        <Title size="md" className="text-balance">
          Not faster typing. A different job
        </Title>
      </Reveal>

      <div className="mt-10 flex w-[1040px] flex-col gap-4">
        {SHIFTS.map((shift) => (
          <ShiftRow key={shift.after} shift={shift} />
        ))}
      </div>
    </Shell>
  );
}
