import { m } from "motion/react";
import {
  BRAND,
  CountRoll,
  DUR,
  EASE,
  cueTransition,
} from "../../_components/motion";
import { useDeckStep } from "../../_components/DeckPrimitives";

const DIAL_SIZE = 128;
const DIAL_RADIUS = 54;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
/** Twelve clock ticks just outside the ring, so the dial reads as time. */
const TICKS = Array.from({ length: 12 }, (_, index) => index * 30);
/** The dial lands, holds for a beat, then the ring drains. */
const DRAIN_LEAD = 0.55;
const DRAIN = 1.8;
const ARC_TOTAL = DRAIN_LEAD + DRAIN;
/** Arm (draw to full), hold, then drain, as fractions of the arc's one tween. */
const ARC_TIMES = [
  0,
  (DRAIN_LEAD - 0.12) / ARC_TOTAL,
  DRAIN_LEAD / ARC_TOTAL,
  1,
];

interface AnnBExpiryDialProps {
  value: number;
  unit: string;
  label: string;
  index: number;
  step: number;
}

/**
 * A lifetime shown as a ring that drains. The figure rolls up to the lifetime
 * and holds, while a lit tip rides the arc back to twelve o'clock, so the dial
 * reads as "this expires" rather than leaving a bare zero on the stage.
 */
export function AnnBExpiryDial({
  value,
  unit,
  label,
  index,
  step,
}: AnnBExpiryDialProps) {
  const current = useDeckStep();
  const running = current >= step;
  // Once the next beat arrives, the lifetimes step back behind the gates.
  const receded = current > step;
  const delay = index * 0.14;
  const drainAt = delay + DRAIN_LEAD;
  const colour = index === 0 ? BRAND.purple : BRAND.blue;
  const centre = DIAL_SIZE / 2;

  return (
    <m.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: 22, scale: 0.9 }}
      animate={
        running
          ? { opacity: receded ? 0.5 : 1, y: receded ? -4 : 0, scale: 1 }
          : { opacity: 0, y: 22, scale: 0.9 }
      }
      transition={
        receded
          ? { duration: DUR.slow, ease: EASE.out }
          : cueTransition(running, delay)
      }
    >
      <div className="relative" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
        <svg
          width={DIAL_SIZE}
          height={DIAL_SIZE}
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          className="-rotate-90 overflow-visible"
          aria-hidden
        >
          {TICKS.map((angle) => (
            <line
              key={angle}
              x1={centre + 62}
              y1={centre}
              x2={centre + (angle % 90 === 0 ? 68 : 66)}
              y2={centre}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={1.5}
              strokeLinecap="round"
              transform={`rotate(${angle} ${centre} ${centre})`}
            />
          ))}
          <circle
            cx={centre}
            cy={centre}
            r={DIAL_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={6}
          />
          <m.circle
            cx={centre}
            cy={centre}
            r={DIAL_RADIUS}
            fill="none"
            stroke={colour}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={DIAL_CIRCUMFERENCE}
            initial={{ strokeDashoffset: DIAL_CIRCUMFERENCE }}
            animate={{
              strokeDashoffset: running
                ? [DIAL_CIRCUMFERENCE, 0, 0, DIAL_CIRCUMFERENCE]
                : DIAL_CIRCUMFERENCE,
            }}
            transition={
              running
                ? {
                    delay,
                    duration: ARC_TOTAL,
                    times: ARC_TIMES,
                    ease: [EASE.expo, "linear", EASE.inOut],
                  }
                : { duration: DUR.fast }
            }
          />
        </svg>

        {/* The lit tip: a dot parked at twelve o'clock, turned with the arc's end. */}
        <m.div
          aria-hidden
          className="absolute inset-0"
          initial={{ rotate: 360, opacity: 0 }}
          animate={
            running
              ? { rotate: 0, opacity: [0, 1, 1, 0] }
              : { rotate: 360, opacity: 0 }
          }
          transition={
            running
              ? {
                  rotate: { duration: DRAIN, ease: EASE.inOut, delay: drainAt },
                  opacity: {
                    duration: DRAIN,
                    times: [0, 0.08, 0.85, 1],
                    delay: drainAt,
                  },
                }
              : { duration: 0 }
          }
        >
          <span
            className="absolute top-[4px] left-1/2 -ml-[9px] size-[18px] rounded-full"
            style={{
              background: `radial-gradient(circle, #fff 0 24%, ${colour}aa 38%, transparent 70%)`,
            }}
          />
        </m.div>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl leading-none font-semibold text-white">
            <CountRoll
              value={value}
              step={step}
              delay={delay + 0.1}
              duration={1.1}
            />
          </span>
          <m.span
            className="mt-1.5 text-xs text-white/50"
            initial={{ opacity: 0, y: 4 }}
            animate={running ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
            transition={cueTransition(running, delay + 0.3, {
              duration: DUR.base,
              ease: EASE.out,
            })}
          >
            {unit}
          </m.span>
        </div>
      </div>

      <m.div
        className="mt-5 text-sm text-white/70"
        initial={{ opacity: 0, y: 6 }}
        animate={running ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
        transition={cueTransition(running, delay + 0.2, {
          duration: DUR.slow,
          ease: EASE.out,
        })}
      >
        {label}
      </m.div>
    </m.div>
  );
}
