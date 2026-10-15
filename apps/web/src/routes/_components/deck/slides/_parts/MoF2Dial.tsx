import { m } from "motion/react";
import { BRAND, DUR, EASE, Sheen } from "../../_components/motion";

/** Clock-hand angles, with twelve o'clock at zero. 03:00 is 90°, 05:00 is 150°. */
const HAND_START = 90;
const HAND_END = 150;

/** One sixth of the dial: the window the routines are staggered across. */
const ARC_SWEEP = 1 / 6;

const DIAL = 210;
const R = 88;

/** Seconds for the 03:00 → 05:00 sweep. The chips light across the same span. */
export const MOF2_SWEEP = 1.5;

const SWEEP = { duration: MOF2_SWEEP, ease: EASE.inOut };

/**
 * The night window as a clock face: twelve hour ticks, a hand that sweeps from
 * three to five, and the arc it leaves behind, with a light riding its tip.
 */
export function MoF2Dial({ running }: { running: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <m.div
        className="relative"
        style={{ width: DIAL, height: DIAL }}
        initial={{ opacity: 0, scale: 0.92, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.45 }}
      >
        <svg
          viewBox="0 0 210 210"
          className="absolute inset-0"
          aria-hidden
          role="presentation"
        >
          <defs>
            <linearGradient id="mof2-dial" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BRAND.purple} />
              <stop offset="100%" stopColor={BRAND.blue} />
            </linearGradient>
          </defs>
          <circle
            cx="105"
            cy="105"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="2"
          />
          {Array.from({ length: 12 }, (_, hour) => (
            <line
              key={hour}
              x1="105"
              y1={105 - R + 8}
              x2="105"
              y2={105 - R + (hour % 3 === 0 ? 18 : 13)}
              stroke={
                hour === 3 || hour === 5
                  ? "rgba(255,255,255,0.5)"
                  : "rgba(255,255,255,0.16)"
              }
              strokeWidth={hour % 3 === 0 ? 2 : 1.5}
              strokeLinecap="round"
              transform={`rotate(${hour * 30} 105 105)`}
            />
          ))}
          <m.circle
            cx="105"
            cy="105"
            r={R}
            fill="none"
            stroke="url(#mof2-dial)"
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: running ? ARC_SWEEP : 0 }}
            transition={running ? SWEEP : { duration: DUR.base }}
          />
        </svg>

        {/* The tip light turns with the hand, so it always sits on the arc's end. */}
        <m.div
          aria-hidden
          className="absolute inset-0"
          initial={{ rotate: HAND_START, opacity: 0 }}
          animate={{
            rotate: running ? HAND_END : HAND_START,
            opacity: running ? 1 : 0,
          }}
          transition={
            running
              ? { ...SWEEP, opacity: { duration: DUR.base } }
              : { duration: DUR.base }
          }
        >
          <span
            className="absolute left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              top: 105 - R,
              background:
                "radial-gradient(circle, #fff 0 22%, rgba(160,140,255,0.55) 34%, transparent 70%)",
            }}
          />
        </m.div>

        <m.div
          aria-hidden
          className="absolute top-1/2 left-1/2 h-[64px] w-[3px] origin-bottom rounded-full bg-white/70"
          style={{ marginLeft: -1.5, marginTop: -64 }}
          initial={{ rotate: HAND_START }}
          animate={{ rotate: running ? HAND_END : HAND_START }}
          transition={running ? SWEEP : { duration: DUR.base }}
        />
        <span className="absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </m.div>

      <m.div
        className="mt-6 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.slow, ease: EASE.out, delay: 0.7 }}
      >
        <Sheen step={1} delay={MOF2_SWEEP} className="rounded-md px-2">
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums">
            03:00 — 05:00
          </div>
        </Sheen>
        <div className="mt-2 text-xs tracking-[0.2em] text-white/40 uppercase">
          UTC
        </div>
      </m.div>
    </div>
  );
}
