import { IconCalendarRepeat, IconCamera, IconTrash } from "@tabler/icons-react";
import { m } from "motion/react";
import { BRAND, EASE_OUT } from "../../_components/DeckPrimitives";
import { AnnBCountDown } from "./AnnBCountDown";

/**
 * The three beats of the workspace lifecycle on the running-costs slide: the
 * one snapshot kept, the 48-hour grace and the weekly sweep. Each takes `live`
 * from its own build step.
 */

/** Every beat's visual shares one box, so the labels sit on one line. */
const VISUAL_H = 160;

/** Three snapshots arrive; the two older ones are dropped and one is kept. */
export function SnapshotStack({ live }: { live: boolean }) {
  return (
    <div className="relative w-[216px]" style={{ height: VISUAL_H }}>
      {[2, 1, 0].map((layer) => {
        const kept = layer === 0;
        return (
          <m.div
            key={layer}
            className="absolute flex h-[112px] w-[168px] items-center justify-center rounded-[16px] bg-white/[0.08]"
            // Older snapshots peek out up and to the left, so the kept one
            // sits centred over its station.
            style={{ left: 24 - layer * 12, top: 36 - layer * 12 }}
            initial={{ opacity: 0, y: 14 }}
            animate={{
              opacity: live ? (kept ? 1 : [0, 0.55, 0.55, 0]) : 0,
              y: live ? 0 : 14,
              boxShadow:
                live && kept
                  ? `0 0 0 1.5px ${BRAND.blue}99`
                  : "0 0 0 1.5px rgba(255,255,255,0)",
            }}
            transition={{
              duration: live ? (kept ? 0.6 : 1.8) : 0.3,
              ease: EASE_OUT,
              delay: live ? 0.1 + (2 - layer) * 0.1 : 0,
              times: live && !kept ? [0, 0.2, 0.55, 1] : undefined,
            }}
          >
            {kept ? (
              <IconCamera
                size={40}
                stroke={1.4}
                className="text-white/70"
                aria-hidden
              />
            ) : null}
          </m.div>
        );
      })}
    </div>
  );
}

/** The grace period: hours falling to zero over a bar that drains with them. */
export function GraceBar({ live }: { live: boolean }) {
  return (
    <div
      className="flex w-[260px] flex-col justify-center"
      style={{ height: VISUAL_H }}
    >
      <div className="text-center text-7xl leading-none font-semibold tracking-[-0.02em] text-white">
        <AnnBCountDown from={48} to={0} step={2} delay={0.3} duration={1.6} />
        <m.span
          className="ml-1 text-4xl text-white/50"
          animate={{ opacity: live ? 1 : 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: live ? 0.3 : 0 }}
        >
          h
        </m.span>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
          <m.div
            className="h-full origin-left rounded-full"
            style={{
              background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
            }}
            initial={{ scaleX: 1 }}
            animate={{ scaleX: live ? 0 : 1 }}
            transition={{
              duration: live ? 1.6 : 0.3,
              ease: EASE_OUT,
              delay: live ? 0.3 : 0,
            }}
          />
        </div>
        {/* Lands as the bar runs out: at zero the workspace is deleted. */}
        <m.span
          className="text-white/70"
          initial={false}
          animate={live ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
          transition={
            live
              ? { type: "spring", bounce: 0, duration: 0.5, delay: 1.7 }
              : { duration: 0.2, ease: EASE_OUT }
          }
        >
          <IconTrash size={26} stroke={1.6} aria-hidden />
        </m.span>
      </div>
    </div>
  );
}

/** Leftovers around the dial, cleared as the beam passes each one. */
const LEFTOVERS = [40, 110, 190, 260, 320];

/** A beam turns once around the weekly calendar and takes the leftovers. */
export function WeeklySweep({ live }: { live: boolean }) {
  const size = 148;
  const radius = size / 2 - 10;

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
            background: `conic-gradient(from 0deg, transparent 0deg, transparent 280deg, ${BRAND.blue}88 360deg)`,
          }}
          initial={{ rotate: 0, opacity: 0 }}
          animate={
            live
              ? { rotate: 360, opacity: [0, 1, 1, 0] }
              : { rotate: 0, opacity: 0 }
          }
          transition={
            live
              ? { duration: 1.6, ease: "easeInOut", times: [0, 0.1, 0.85, 1] }
              : { duration: 0.2, ease: EASE_OUT }
          }
        />
        {LEFTOVERS.map((angle) => (
          <m.span
            key={angle}
            aria-hidden
            className="absolute size-2.5 rounded-full bg-white/40"
            style={{
              left: size / 2 - 5 + radius * Math.sin((angle * Math.PI) / 180),
              top: size / 2 - 5 - radius * Math.cos((angle * Math.PI) / 180),
            }}
            animate={
              live ? { opacity: 0, scale: 0.4 } : { opacity: 1, scale: 1 }
            }
            transition={{
              duration: 0.3,
              ease: EASE_OUT,
              delay: live ? (angle / 360) * 1.6 : 0,
            }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <IconCalendarRepeat
            size={52}
            stroke={1.4}
            className="text-white/80"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
