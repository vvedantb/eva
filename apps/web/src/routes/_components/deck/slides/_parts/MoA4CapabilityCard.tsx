import { IconCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import { springTransition } from "@vvedantb/ui";
import { Card } from "../../_components/DeckPrimitives";
import { BRAND_GRADIENT, DUR, EASE } from "../../_components/motion";

/** Proof lines land in reading order, this far apart. */
export const MO_A4_TICK_GAP = 0.07;
/** The first proof waits for the camera to start straightening. */
const TICK_LEAD = 0.25;

/** A proof line; `credit` names the colleague whose idea it was. */
export type CapabilityProof = string | { text: string; credit: string };

/**
 * One capability on the a15 framework board. It rises into the grid on entry;
 * on the evidence step its proof lines arrive underneath, each with its own
 * tick, as reminders of the slides that showed it.
 */
export function MoA4CapabilityCard({
  name,
  proof,
  index,
  evidenced,
}: {
  name: string;
  proof: readonly CapabilityProof[];
  index: number;
  evidenced: boolean;
}) {
  const enter = 0.35 + index * 0.05;
  const tick = TICK_LEAD + index * MO_A4_TICK_GAP;

  return (
    <m.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: DUR.slow, ease: EASE.expo, delay: enter }}
    >
      {/* Its own viewing distance, so the hover tilts the card about its own
          centre rather than the grid's. */}
      <m.div
        style={{ transformPerspective: 900, transformStyle: "preserve-3d" }}
        whileHover={{ rotateX: -6, rotateY: 4, z: 24 }}
        transition={springTransition}
      >
        <Card className="flex flex-col gap-2 px-5 py-3.5">
          <span className="text-base leading-snug font-medium text-white">
            {name}
          </span>
          <ul className="flex flex-col gap-1.5">
            {proof.map((entry, row) => {
              const at = tick + row * 0.12;
              const line = typeof entry === "string" ? entry : entry.text;
              return (
                <m.li
                  key={line}
                  className="flex items-start gap-2 text-[13px] leading-tight text-white/60"
                  initial={false}
                  animate={
                    evidenced ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }
                  }
                  transition={
                    evidenced
                      ? { duration: DUR.base, ease: EASE.out, delay: at }
                      : { duration: DUR.fast }
                  }
                >
                  <m.span
                    aria-hidden
                    className="mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full"
                    style={{ background: BRAND_GRADIENT }}
                    initial={false}
                    animate={
                      evidenced
                        ? { scale: 1, rotate: 0 }
                        : { scale: 0, rotate: -45 }
                    }
                    transition={
                      evidenced
                        ? { duration: DUR.base, ease: EASE.expo, delay: at }
                        : { duration: DUR.fast }
                    }
                  >
                    <IconCheck size={9} stroke={3.5} className="text-white" />
                  </m.span>
                  <span>
                    {line}
                    {typeof entry === "string" ? null : (
                      <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/70">
                        {entry.credit}
                      </span>
                    )}
                  </span>
                </m.li>
              );
            })}
          </ul>
        </Card>
      </m.div>
    </m.div>
  );
}
