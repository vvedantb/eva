import { m } from "motion/react";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

const WIDTH = 380;
const HEIGHT = 30;

/**
 * The old path: a line drawn by reading a terminal, so it wanders. The wobble
 * is deliberate and hand-written — a generated sine would read as decoration.
 */
const RAGGED =
  "M0 15 L38 8 L76 21 L114 10 L152 22 L190 11 L228 23 L266 9 L304 20 L342 12 L380 15";

const STRAIGHT = `M0 ${HEIGHT / 2} L${WIDTH} ${HEIGHT / 2}`;

interface AnnBConnectionProps {
  label: string;
  date: string;
  /** Position in the stagger, from the top. */
  index: number;
  /** The build step that converts this line. */
  step: number;
}

/**
 * One provider's connection, shown converting from a ragged dotted line into a
 * solid brand-gradient one. Used three times on the "proper connections" slide.
 */
export function AnnBConnection({
  label,
  date,
  index,
  step,
}: AnnBConnectionProps) {
  const converted = useDeckStep() >= step;
  const delay = converted ? index * 0.24 : 0;
  const gradientId = `annb-connection-${index}`;

  return (
    <div className="flex h-[58px] items-center gap-8">
      <div className="w-[150px] shrink-0 text-lg text-white/85">{label}</div>

      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="shrink-0 overflow-visible"
        aria-hidden
      >
        <defs>
          {/* User space, not the bounding box: a straight horizontal line has
              zero height, and an object-bounding-box gradient collapses on it. */}
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={WIDTH}
            y2={0}
          >
            <stop offset="0%" stopColor={BRAND.purple} />
            <stop offset="100%" stopColor={BRAND.blue} />
          </linearGradient>
        </defs>

        <m.path
          d={RAGGED}
          fill="none"
          stroke="rgba(255,255,255,0.32)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="2 7"
          animate={{ opacity: converted ? 0 : 1 }}
          transition={{
            duration: converted ? 0.45 : 0.25,
            ease: EASE_OUT,
            delay,
          }}
        />

        <m.path
          d={STRAIGHT}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={
            converted
              ? { pathLength: 1, opacity: 1 }
              : { pathLength: 0, opacity: 0 }
          }
          transition={{
            duration: converted ? 0.75 : 0.25,
            ease: EASE_OUT,
            delay: converted ? delay + 0.15 : 0,
          }}
        />
      </svg>

      <m.div
        className="w-[130px] shrink-0 text-right text-sm tabular-nums"
        animate={{
          opacity: converted ? 1 : 0.35,
          color: converted ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)",
        }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: delay + 0.3 }}
      >
        {date}
      </m.div>
    </div>
  );
}
