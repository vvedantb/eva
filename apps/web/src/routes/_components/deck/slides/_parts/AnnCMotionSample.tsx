import { m } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";
import { BRAND_GRADIENT, DUR, EASE } from "../../_components/motion";

/** A sample pose. Keep to transform and opacity. */
type SamplePose = TargetAndTransition;

export interface AnnCMotionSampleSpec {
  label: string;
  /** The timing this sample ran on before the house defaults landed. */
  free: number;
  /** Bouncy samples keep their spring; the rest ride the house curve. */
  bounce?: number;
  from: SamplePose;
  to: SamplePose;
}

/** Every sample settles on this once the house defaults are applied. */
const HOUSE_DURATION = 0.55;
const HOUSE_REST = 0.45;
/** One full there-and-back on the house timing: the beat the room can feel. */
export const ANN_C_HOUSE_CYCLE = (HOUSE_DURATION + HOUSE_REST) * 2;
/** On the sync, all ten hold still together for this long before moving as one. */
export const ANN_C_SYNC_HOLD = 0.55;

/**
 * Ten one-property demonstrations, in the order they are read. Each one is the
 * thing it is named after, so the grid explains itself without a caption.
 */
export const ANN_C_MOTION_SAMPLES: readonly AnnCMotionSampleSpec[] = [
  { label: "Fade", free: 1.1, from: { opacity: 0.12 }, to: { opacity: 1 } },
  { label: "Slide", free: 0.75, from: { x: -18 }, to: { x: 18 } },
  { label: "Spring", free: 0.9, bounce: 0.55, from: { y: 10 }, to: { y: -10 } },
  { label: "Scale", free: 1.3, from: { scale: 0.55 }, to: { scale: 1.15 } },
  { label: "Press", free: 0.5, from: { scale: 1 }, to: { scale: 0.72 } },
  {
    label: "Lift",
    free: 1.5,
    from: { y: 0, scale: 1 },
    to: { y: -12, scale: 1.08 },
  },
  { label: "Turn", free: 1.7, from: { rotate: 0 }, to: { rotate: 90 } },
  { label: "Draw", free: 0.95, from: { scaleX: 0.15 }, to: { scaleX: 1 } },
  {
    label: "Focus",
    free: 1.2,
    from: { scale: 0.7, opacity: 0.2 },
    to: { scale: 1, opacity: 1 },
  },
  { label: "Settle", free: 2, bounce: 0.4, from: { y: -12 }, to: { y: 0 } },
];

function loop(spec: AnnCMotionSampleSpec, synced: boolean): Transition {
  if (synced) {
    return {
      duration: HOUSE_DURATION,
      ease: EASE.out,
      repeat: Infinity,
      repeatType: "mirror",
      repeatDelay: HOUSE_REST,
      delay: ANN_C_SYNC_HOLD,
    };
  }
  const shared: Transition = {
    duration: spec.free,
    repeat: Infinity,
    repeatType: "mirror",
    repeatDelay: spec.free * 0.4,
  };
  return spec.bounce === undefined
    ? { ...shared, ease: EASE.out }
    : { ...shared, type: "spring", bounce: spec.bounce };
}

/**
 * One motion sample, looping. `synced` swaps every sample onto the same
 * duration, curve and rest. On the swap all ten snap back to their start pose
 * and hold still together for a beat, then move as one — the room sees them
 * fall into step rather than drift into it.
 */
export function AnnCMotionSample({
  spec,
  synced,
}: {
  spec: AnnCMotionSampleSpec;
  synced: boolean;
}) {
  return (
    <m.div
      className="relative flex h-[104px] flex-col items-center justify-center gap-4 overflow-hidden rounded-[14px]"
      animate={{
        backgroundColor: synced
          ? "rgba(255,255,255,0.085)"
          : "rgba(255,255,255,0.045)",
      }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      {/* The tile's own track: a faint rail the sample moves along. */}
      <span
        aria-hidden
        className="absolute inset-x-6 top-[38px] h-px bg-white/[0.06]"
      />
      <div className="flex h-9 w-full items-center justify-center">
        <m.div
          // Remounting on the boundary restarts all ten from the same pose.
          key={synced ? "house" : "free"}
          className="size-7 rounded-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
          style={{ background: BRAND_GRADIENT }}
          initial={spec.from}
          animate={spec.to}
          transition={loop(spec, synced)}
        />
      </div>
      <m.span
        className="text-xs tracking-[0.14em] uppercase"
        animate={{
          color: synced ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)",
        }}
        transition={{ duration: DUR.slow, delay: synced ? ANN_C_SYNC_HOLD : 0 }}
      >
        {spec.label}
      </m.span>
    </m.div>
  );
}
