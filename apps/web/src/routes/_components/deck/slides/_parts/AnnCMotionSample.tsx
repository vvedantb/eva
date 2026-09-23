import { m } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";
import { BRAND, EASE_OUT } from "../../_components/DeckPrimitives";

export interface AnnCMotionSampleSpec {
  label: string;
  /** The timing this sample ran on before the house defaults landed. */
  free: number;
  /** Bouncy samples keep their spring; the rest ride the house curve. */
  bounce?: number;
  target: TargetAndTransition;
}

const GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;

/** Every sample settles on this once the house defaults are applied. */
const HOUSE_DURATION = 0.55;
const HOUSE_DELAY = 0.45;

/**
 * Ten one-property demonstrations, in the order they are read. Each one is the
 * thing it is named after, so the grid explains itself without a caption.
 */
export const ANN_C_MOTION_SAMPLES: readonly AnnCMotionSampleSpec[] = [
  { label: "Fade", free: 1.1, target: { opacity: [0.12, 1] } },
  { label: "Slide", free: 0.75, target: { x: [-18, 18] } },
  { label: "Spring", free: 0.9, bounce: 0.55, target: { y: [10, -10] } },
  { label: "Scale", free: 1.3, target: { scale: [0.55, 1.15] } },
  { label: "Press", free: 0.5, target: { scale: [1, 0.72] } },
  { label: "Lift", free: 1.5, target: { y: [0, -12], scale: [1, 1.08] } },
  { label: "Turn", free: 1.7, target: { rotate: [0, 90] } },
  { label: "Draw", free: 0.95, target: { scaleX: [0.15, 1] } },
  { label: "Focus", free: 1.2, target: { scale: [0.7, 1], opacity: [0.2, 1] } },
  { label: "Settle", free: 2, bounce: 0.4, target: { y: [-12, 0] } },
];

/**
 * One motion sample, looping. `synced` swaps every sample onto the same
 * duration, curve and rest — which is the whole point of the slide, so the
 * change has to be visible rather than described.
 */
export function AnnCMotionSample({
  spec,
  synced,
}: {
  spec: AnnCMotionSampleSpec;
  synced: boolean;
}) {
  const duration = synced ? HOUSE_DURATION : spec.free;
  const transition: Transition =
    spec.bounce !== undefined && !synced
      ? {
          type: "spring",
          bounce: spec.bounce,
          duration,
          repeat: Infinity,
          repeatType: "mirror",
          repeatDelay: spec.free * 0.4,
        }
      : {
          duration,
          ease: EASE_OUT,
          repeat: Infinity,
          repeatType: "mirror",
          repeatDelay: synced ? HOUSE_DELAY : spec.free * 0.4,
        };

  return (
    <m.div
      className="flex h-[104px] flex-col items-center justify-center gap-4 rounded-[14px]"
      animate={{
        backgroundColor: synced
          ? "rgba(255,255,255,0.09)"
          : "rgba(255,255,255,0.05)",
      }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <div className="flex h-9 w-full items-center justify-center">
        <m.div
          // Remounting on the boundary restarts all ten together, so the room
          // sees them fall into step rather than drift into it.
          key={synced ? "house" : "free"}
          className="size-7 rounded-[8px]"
          style={{ background: GRADIENT }}
          animate={spec.target}
          transition={transition}
        />
      </div>
      <span className="text-xs tracking-[0.14em] text-white/45 uppercase">
        {spec.label}
      </span>
    </m.div>
  );
}
