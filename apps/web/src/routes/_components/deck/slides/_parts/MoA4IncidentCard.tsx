import type { Icon } from "@tabler/icons-react";
import { m } from "motion/react";
import { Layer } from "../../_components/DeckCamera";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  Pulse,
  SETTLE,
} from "../../_components/motion";

/** How far each incident card stands off the rail joining them. */
const CARD_DEPTH = 20;
const RAIL = 60;

interface MoA4IncidentCardProps {
  icon: Icon;
  heading: string;
  date: string;
  /** Position in the row; the card lands on this build step. */
  index: number;
  step: number;
  /** The card that landed most recently. It stays lit and live. */
  newest: number;
}

/**
 * One reported incident on the a13 people slide. It rises out of depth onto
 * the rail; a point of light runs the rail from the incident before, so the
 * row reads as one thread of reports. The newest one pulses as the live case.
 */
export function MoA4IncidentCard({
  icon: IncidentIcon,
  heading,
  date,
  index,
  step,
  newest,
}: MoA4IncidentCardProps) {
  const landed = step >= index;
  const live = landed && index === newest;

  return (
    <div
      className="flex items-center"
      style={{ transformStyle: "preserve-3d" }}
    >
      {index > 0 && (
        <Layer depth={0}>
          <div className="relative h-px" style={{ width: RAIL }}>
            <m.div
              aria-hidden
              className="absolute inset-0 origin-left rounded-full"
              style={{ background: BRAND_GRADIENT }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: landed ? 1 : 0 }}
              transition={
                landed
                  ? { duration: DUR.slow, ease: EASE.inOut }
                  : { duration: DUR.fast }
              }
            />
            {/* The light that carries the thread to the new card. */}
            <m.span
              aria-hidden
              className="absolute top-1/2 left-0 -mt-[5px] -ml-[5px] size-2.5 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, #fff 0 25%, rgba(160,140,255,0.5) 45%, transparent 72%)",
              }}
              initial={{ x: 0, opacity: 0 }}
              animate={
                landed
                  ? { x: RAIL, opacity: [0, 1, 1, 0] }
                  : { x: 0, opacity: 0 }
              }
              transition={
                landed
                  ? {
                      x: { duration: DUR.slow, ease: EASE.inOut },
                      opacity: { duration: DUR.slow, times: [0, 0.1, 0.8, 1] },
                    }
                  : { duration: 0 }
              }
            />
          </div>
        </Layer>
      )}

      <Layer depth={CARD_DEPTH}>
        <m.div
          className="relative isolate flex h-[180px] w-[300px] flex-col justify-between overflow-hidden rounded-2xl bg-white/[0.05] p-6"
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{
            opacity: landed ? (live ? 1 : 0.5) : 0,
            y: landed ? 0 : 30,
            scale: landed ? 1 : 0.9,
          }}
          transition={
            landed
              ? { ...SETTLE, delay: index > 0 && live ? 0.2 : 0 }
              : { duration: DUR.fast }
          }
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 -z-10 h-1/2 bg-gradient-to-b from-white/[0.05] to-transparent"
          />
          <div className="flex items-start justify-between">
            <span className="relative flex">
              {live && (
                <Pulse
                  color={BRAND.blue}
                  rings={2}
                  period={2.4}
                  reach={1.5}
                  delay={0.6}
                  className="absolute inset-0 rounded-xl"
                >
                  <span className="size-10 rounded-xl" />
                </Pulse>
              )}
              <m.span
                className="relative flex size-10 items-center justify-center rounded-xl"
                initial={false}
                animate={{
                  backgroundColor: live
                    ? "rgba(59,125,216,0.18)"
                    : "rgba(255,255,255,0.06)",
                }}
                transition={{ duration: DUR.slow }}
              >
                <IncidentIcon
                  size={22}
                  stroke={1.6}
                  className={live ? "text-white/90" : "text-white/60"}
                  aria-hidden
                />
              </m.span>
            </span>
            <span className="rounded-full bg-white/[0.08] px-3 py-1 text-xs text-white/55">
              {date}
            </span>
          </div>
          <div className="text-xl leading-snug font-semibold text-white">
            {heading}
          </div>
        </m.div>
      </Layer>
    </div>
  );
}
