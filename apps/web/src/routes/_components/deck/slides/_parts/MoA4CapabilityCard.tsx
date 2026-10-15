import { IconCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import { motionSpring } from "@eva/ui";
import { Card } from "../../_components/DeckPrimitives";
import { BRAND, BRAND_GRADIENT, DUR, EASE } from "../../_components/motion";

/** Ticks land in reading order, this far apart. */
export const MO_A4_TICK_GAP = 0.07;
/** The first tick waits for the camera to start straightening. */
const TICK_LEAD = 0.25;

/**
 * One capability on the a15 framework board. It rises into the grid on entry;
 * on the evidence step its tick stamps in with a single ring of light, and the
 * card lifts a touch, as though checked off the board.
 */
export function MoA4CapabilityCard({
  name,
  index,
  evidenced,
}: {
  name: string;
  index: number;
  evidenced: boolean;
}) {
  const enter = 0.35 + index * 0.05;
  const tick = TICK_LEAD + index * MO_A4_TICK_GAP;

  return (
    <m.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: evidenced ? -4 : 0, scale: 1 }}
      transition={{
        duration: DUR.slow,
        ease: EASE.expo,
        delay: evidenced ? tick : enter,
      }}
    >
      {/* Its own viewing distance, so the hover tilts the card about its own
          centre rather than the grid's. */}
      <m.div
        style={{ transformPerspective: 900, transformStyle: "preserve-3d" }}
        whileHover={{ rotateX: -6, rotateY: 4, z: 24 }}
        transition={motionSpring}
      >
        <Card className="relative flex h-[68px] items-center p-5">
          <span className="text-base leading-snug font-medium text-white">
            {name}
          </span>
          <span className="absolute top-3 right-3 flex size-5 items-center justify-center">
            {/* One ring, once: the stamp of the tick landing. */}
            <m.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ border: `1.5px solid ${BRAND.blue}` }}
              initial={{ scale: 1, opacity: 0 }}
              animate={
                evidenced
                  ? { scale: [1, 2.4], opacity: [0.8, 0] }
                  : { scale: 1, opacity: 0 }
              }
              transition={
                evidenced
                  ? { duration: 0.8, ease: EASE.out, delay: tick + 0.08 }
                  : { duration: 0 }
              }
            />
            <m.span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full"
              style={{ background: BRAND_GRADIENT }}
              initial={false}
              animate={
                evidenced
                  ? { scale: 1, opacity: 1, rotate: 0 }
                  : { scale: 0, opacity: 0, rotate: -45 }
              }
              transition={
                evidenced
                  ? { duration: DUR.base, ease: EASE.expo, delay: tick }
                  : { duration: DUR.fast }
              }
            >
              <IconCheck size={13} stroke={3} className="text-white" />
            </m.span>
          </span>
        </Card>
      </m.div>
    </m.div>
  );
}
