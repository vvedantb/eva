import { m } from "motion/react";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

const DIAL_SIZE = 128;
const DIAL_RADIUS = 54;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

interface AnnBExpiryDialProps {
  value: number;
  unit: string;
  label: string;
  index: number;
  step: number;
}

/**
 * A lifetime shown as a ring that drains. The figure holds at the lifetime and
 * the arc does the counting, so the dial reads as "this expires" rather than
 * leaving a bare zero on the stage.
 */
export function AnnBExpiryDial({
  value,
  unit,
  label,
  index,
  step,
}: AnnBExpiryDialProps) {
  const running = useDeckStep() >= step;
  const delay = running ? index * 0.2 : 0;

  return (
    <m.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: 16 }}
      animate={running ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ type: "spring", bounce: 0, duration: 0.55, delay }}
    >
      <div className="relative" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
        <svg
          width={DIAL_SIZE}
          height={DIAL_SIZE}
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={DIAL_SIZE / 2}
            cy={DIAL_SIZE / 2}
            r={DIAL_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={6}
          />
          <m.circle
            cx={DIAL_SIZE / 2}
            cy={DIAL_SIZE / 2}
            r={DIAL_RADIUS}
            fill="none"
            stroke={index === 0 ? BRAND.purple : BRAND.blue}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={DIAL_CIRCUMFERENCE}
            initial={{ strokeDashoffset: 0 }}
            animate={{
              strokeDashoffset: running ? DIAL_CIRCUMFERENCE : 0,
            }}
            transition={{
              duration: running ? 1.6 : 0.3,
              ease: EASE_OUT,
              delay: running ? delay + 0.25 : 0,
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl leading-none font-semibold tabular-nums text-white">
            {value}
          </span>
          <span className="mt-1.5 text-xs text-white/50">{unit}</span>
        </div>
      </div>

      <div className="mt-4 text-sm text-white/70">{label}</div>
    </m.div>
  );
}

const GATE_SIZE = 168;
const GATES: readonly { radius: number; width: number }[] = [
  { radius: 72, width: 7 },
  { radius: 46, width: 7 },
];

/**
 * The two independent checks, drawn as concentric gates swinging shut. Each
 * ring starts as an open arc and closes into a complete circle.
 */
export function AnnBGates({ step }: { step: number }) {
  const closing = useDeckStep() >= step;

  return (
    <svg
      width={GATE_SIZE}
      height={GATE_SIZE}
      viewBox={`0 0 ${GATE_SIZE} ${GATE_SIZE}`}
      className="-rotate-90"
      aria-hidden
    >
      {GATES.map((gate, index) => {
        const circumference = 2 * Math.PI * gate.radius;
        return (
          <g key={gate.radius}>
            <circle
              cx={GATE_SIZE / 2}
              cy={GATE_SIZE / 2}
              r={gate.radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={gate.width}
            />
            <m.circle
              cx={GATE_SIZE / 2}
              cy={GATE_SIZE / 2}
              r={gate.radius}
              fill="none"
              stroke={index === 0 ? BRAND.blue : BRAND.purple}
              strokeWidth={gate.width}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference * 0.62, opacity: 0 }}
              animate={{
                strokeDashoffset: closing ? 0 : circumference * 0.62,
                opacity: closing ? 1 : 0,
              }}
              transition={{
                duration: closing ? 0.85 : 0.3,
                ease: EASE_OUT,
                delay: closing ? index * 0.28 : 0,
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}
