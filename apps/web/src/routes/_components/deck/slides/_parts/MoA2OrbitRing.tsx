import { useId } from "react";
import { m } from "motion/react";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import { EASE, cueTransition } from "../../_components/motion";

/**
 * One orbit of the control-panel diagram. A faint track is always there; on
 * its step a brand-gradient stroke draws the full circle from twelve o'clock.
 * `pathLength` on one thin stroke, nothing else moves.
 */
export function MoA2OrbitRing({
  cx,
  cy,
  radius,
  step,
}: {
  cx: number;
  cy: number;
  radius: number;
  step: number;
}) {
  const lit = useDeckStep() >= step;
  const gradientId = useId();
  const box = radius * 2 + 4;

  return (
    <svg
      aria-hidden
      width={box}
      height={box}
      className="pointer-events-none absolute -rotate-90 overflow-visible"
      style={{ left: cx - box / 2, top: cy - box / 2 }}
      fill="none"
    >
      <linearGradient
        id={gradientId}
        gradientUnits="userSpaceOnUse"
        x1={0}
        y1={0}
        x2={box}
        y2={box}
      >
        <stop offset="0%" stopColor={BRAND.purple} stopOpacity={0.7} />
        <stop offset="100%" stopColor={BRAND.blue} stopOpacity={0.7} />
      </linearGradient>
      <circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />
      <m.circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        stroke={`url(#${gradientId})`}
        strokeWidth={1.25}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={
          lit ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }
        }
        transition={cueTransition(lit, 0, {
          duration: 1.2,
          ease: EASE.inOut,
          opacity: { duration: 0.2 },
        })}
      />
    </svg>
  );
}
