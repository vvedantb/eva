import { Fragment } from "react";
import { m } from "motion/react";
import { Layer } from "../../_components/DeckCamera";
import { BRAND, EASE_OUT } from "../../_components/DeckPrimitives";

export interface AnnualPhase {
  label: string;
  date: string;
}

/** Seconds between one phase lighting up and the next. */
const STAGGER = 0.3;
/** How long the rail takes to fill between two phases. */
const FILL = 0.24;
const GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;
/** How far the numbered circles stand off the rail they sit on. */
const NODE_DEPTH = 40;

/**
 * The fade lives on the circle and the caption rather than on the node itself:
 * an opacity below 1 forces `transform-style: flat`, which would collapse the
 * `Layer` depth every time a phase faded in.
 */
function PhaseNode({
  phase,
  index,
  active,
}: {
  phase: AnnualPhase;
  index: number;
  active: boolean;
}) {
  const delay = index * STAGGER;
  const fade = {
    duration: active ? 0.4 : 0.2,
    ease: EASE_OUT,
    delay: active ? delay : 0,
  };

  return (
    <div
      className="w-[136px] shrink-0 text-center"
      style={{ transformStyle: "preserve-3d" }}
    >
      <Layer depth={NODE_DEPTH}>
        <m.span
          className="mx-auto flex size-11 items-center justify-center rounded-full text-base font-semibold tabular-nums text-white"
          style={{ background: GRADIENT }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.5 }}
          transition={{
            opacity: fade,
            scale: active
              ? { type: "spring", bounce: 0, duration: 0.5, delay }
              : { duration: 0.2 },
          }}
        >
          {index + 1}
        </m.span>
      </Layer>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={fade}
      >
        {/* Fixed height so a two-line label does not push its date out of line. */}
        <div className="mt-4 flex h-9 items-start justify-center text-[15px] leading-tight font-medium text-white">
          {phase.label}
        </div>
        <div className="text-xs leading-none text-white/45">{phase.date}</div>
      </m.div>
    </div>
  );
}

/** A rail segment that fills left to right with a light packet running along it. */
function PhaseConnector({ active, delay }: { active: boolean; delay: number }) {
  return (
    <m.div
      className="relative h-px min-w-0 flex-1 self-start bg-white/12"
      initial={{ opacity: 0 }}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay: active ? delay : 0 }}
    >
      <m.div
        aria-hidden
        className="absolute inset-0 origin-left"
        style={{ background: GRADIENT }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: active ? 1 : 0 }}
        transition={{
          duration: active ? FILL : 0.2,
          ease: "linear",
          delay: active ? delay : 0,
        }}
      />
      {/* Kept mounted: the travel has to be triggered by a prop change. */}
      <m.div
        aria-hidden
        className="absolute top-1/2 -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-white shadow-[0_0_14px_#3B7DD8]"
        initial={{ left: "0%", opacity: 0 }}
        animate={
          active
            ? { left: "100%", opacity: [0, 1, 1, 0] }
            : { left: "0%", opacity: 0 }
        }
        transition={{
          duration: active ? FILL : 0.2,
          ease: "linear",
          delay: active ? delay : 0,
        }}
      />
    </m.div>
  );
}

/**
 * A phased plan drawn as one rail: numbered nodes light up in turn while a
 * gradient fills between them. Used for the sandbox provider migration.
 */
export function AnnualPhasePipeline({
  phases,
  active,
}: {
  phases: readonly AnnualPhase[];
  active: boolean;
}) {
  return (
    <div
      className="flex w-full items-start"
      style={{ transformStyle: "preserve-3d" }}
    >
      {phases.map((phase, index) => (
        <Fragment key={phase.label}>
          {index > 0 && (
            <Layer depth={0} className="mt-[22px] flex min-w-0 flex-1">
              <PhaseConnector
                active={active}
                delay={(index - 1) * STAGGER + 0.12}
              />
            </Layer>
          )}
          <PhaseNode phase={phase} index={index} active={active} />
        </Fragment>
      ))}
    </div>
  );
}
