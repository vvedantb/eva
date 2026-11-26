import { useId } from "react";
import { m } from "motion/react";
import { BRAND } from "../../_components/DeckPrimitives";
import { EASE, cueTransition } from "../../_components/motion";

/** Clear space between the avatar and its ring, in pixels. */
const GAP = 7;

/**
 * A brand-gradient ring that draws itself around an avatar from twelve
 * o'clock — "this person now has their own". Thin stroke, `pathLength` only.
 */
export function MoA2AvatarRing({
  size,
  on,
  delay,
}: {
  /** Diameter of the avatar it circles. */
  size: number;
  on: boolean;
  delay: number;
}) {
  const gradientId = useId();
  const box = size + GAP * 2;
  const radius = box / 2 - 1;

  return (
    <svg
      aria-hidden
      width={box}
      height={box}
      className="pointer-events-none absolute -rotate-90"
      style={{ left: -GAP, top: -GAP }}
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
        <stop offset="0%" stopColor={BRAND.purple} />
        <stop offset="100%" stopColor={BRAND.blue} />
      </linearGradient>
      <m.circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        stroke={`url(#${gradientId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={
          on ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }
        }
        transition={cueTransition(on, delay, {
          duration: 1,
          ease: EASE.inOut,
          opacity: { duration: 0.2, delay },
        })}
      />
    </svg>
  );
}
