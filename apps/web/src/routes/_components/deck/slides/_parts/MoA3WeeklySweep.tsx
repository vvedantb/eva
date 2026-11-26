import { IconCalendarRepeat } from "@tabler/icons-react";
import { m } from "motion/react";
import { BRAND, DUR, EASE } from "../../_components/motion";
import { moA3InOutAt } from "./MoA3Timing";

/** The weekly sweep, the third beat of the running-costs slide (c07). */

/** Matches the other lifecycle beats, so the labels sit on one line. */
const VISUAL_H = 160;

/** Leftovers around the dial, cleared as the beam passes each one. */
const LEFTOVERS = [40, 110, 190, 260, 320];
const SWEEP = 2;

/** A beam turns once around the weekly calendar and takes the leftovers. */
export function MoA3WeeklySweep({ live }: { live: boolean }) {
  const size = 148;
  const radius = size / 2 - 12;

  return (
    <div
      className="flex items-center justify-center"
      style={{ height: VISUAL_H }}
    >
      <div
        className="relative overflow-hidden rounded-full bg-white/[0.05]"
        style={{ width: size, height: size }}
      >
        <m.div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, transparent 250deg, ${BRAND.blue}99 360deg)`,
          }}
          initial={{ rotate: 0, opacity: 0 }}
          animate={
            live
              ? { rotate: 360, opacity: [0, 1, 1, 0] }
              : { rotate: 0, opacity: 0 }
          }
          transition={
            live
              ? {
                  rotate: { duration: SWEEP, ease: EASE.inOut, delay: 0.2 },
                  opacity: {
                    duration: SWEEP,
                    times: [0, 0.08, 0.85, 1],
                    delay: 0.2,
                  },
                }
              : { duration: DUR.fast }
          }
        />
        {LEFTOVERS.map((angle) => (
          <m.span
            key={angle}
            aria-hidden
            className="absolute size-2.5 rounded-full bg-white/45"
            style={{
              left: size / 2 - 5 + radius * Math.sin((angle * Math.PI) / 180),
              top: size / 2 - 5 - radius * Math.cos((angle * Math.PI) / 180),
            }}
            animate={
              live ? { opacity: 0, scale: 2.2 } : { opacity: 1, scale: 1 }
            }
            transition={{
              duration: DUR.base,
              ease: EASE.out,
              // In step with the beam's eased turn: it lingers at the ends.
              delay: live ? 0.2 + moA3InOutAt(angle / 360) * SWEEP : 0,
            }}
          />
        ))}
        <m.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ scale: live ? [1, 1, 1.08, 1] : 1 }}
          transition={
            live
              ? {
                  duration: 0.7,
                  times: [0, 0.01, 0.4, 1],
                  delay: 0.2 + SWEEP - 0.2,
                }
              : { duration: DUR.fast }
          }
        >
          <IconCalendarRepeat
            size={52}
            stroke={1.4}
            className="text-white/85"
            aria-hidden
          />
        </m.div>
      </div>
    </div>
  );
}
