import { Fragment } from "react";
import { m } from "motion/react";
import { BRAND, Card, EASE_OUT } from "../../_components/DeckPrimitives";

export interface AnnualPhase {
  label: string;
  date: string;
}

/** Seconds between one phase popping in and the next. */
const STAGGER = 0.12;

function PhaseNode({
  phase,
  index,
  active,
}: {
  phase: AnnualPhase;
  index: number;
  active: boolean;
}) {
  return (
    <m.div
      className="w-[150px] shrink-0"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
      transition={
        active
          ? { type: "spring", bounce: 0, duration: 0.5, delay: index * STAGGER }
          : { duration: 0.2 }
      }
    >
      <Card className="flex h-[140px] flex-col items-center justify-center gap-2 px-3 py-4 text-center">
        <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-xs tabular-nums text-white/55">
          {index + 1}
        </span>
        <div className="text-sm leading-tight font-medium text-white">
          {phase.label}
        </div>
        <div className="text-xs leading-none text-white/45">{phase.date}</div>
      </Card>
    </m.div>
  );
}

function PhaseConnector({ active, delay }: { active: boolean; delay: number }) {
  return (
    <div className="relative h-px min-w-0 flex-1 self-center bg-white/15">
      <m.div
        aria-hidden
        className="absolute inset-0 origin-left"
        style={{
          background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: active ? 1 : 0 }}
        transition={{
          duration: active ? 0.4 : 0.2,
          ease: EASE_OUT,
          delay: active ? delay : 0,
        }}
      />
    </div>
  );
}

/**
 * A phased plan drawn as one rail: each phase pops in behind a line that fills
 * left to right. Used for the sandbox provider migration.
 */
export function AnnualPhasePipeline({
  phases,
  active,
}: {
  phases: readonly AnnualPhase[];
  active: boolean;
}) {
  return (
    <div className="flex w-full items-stretch">
      {phases.map((phase, index) => (
        <Fragment key={phase.label}>
          {index > 0 && (
            <PhaseConnector
              active={active}
              delay={(index - 1) * STAGGER + 0.06}
            />
          )}
          <PhaseNode phase={phase} index={index} active={active} />
        </Fragment>
      ))}
    </div>
  );
}
