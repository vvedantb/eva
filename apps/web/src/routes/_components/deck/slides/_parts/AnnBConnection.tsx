import { m } from "motion/react";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, cueTransition } from "../../_components/motion";

const WIDTH = 560;
const HEIGHT = 30;
const MID = HEIGHT / 2;

/**
 * The old path: a line drawn by reading a terminal, so it wanders. The wobble
 * is deliberate and hand-written — a generated sine would read as decoration.
 * The taut line has the same points at the same x, so one morphs into the other.
 */
const WOBBLE = [15, 8, 21, 10, 22, 11, 23, 9, 20, 12, 15];
const STEP_X = WIDTH / (WOBBLE.length - 1);
const pathThrough = (ys: readonly number[]) =>
  ys.map((y, i) => `${i === 0 ? "M" : "L"}${i * STEP_X} ${y}`).join(" ");
const RAGGED = pathThrough(WOBBLE);
const TAUT = pathThrough(WOBBLE.map(() => MID));

/** Seconds for the wire to pull taut. */
const PULL = 0.9;
/** Seconds for one reply to cross the finished line. */
const TRIP = 1.5;

interface AnnBConnectionProps {
  label: string;
  date: string;
  /** Position in the stagger, from the top. */
  index: number;
  /** The build step that converts this line. */
  step: number;
}

/**
 * One provider's connection. On its step the wandering dotted line pulls
 * taut into a brand-gradient wire, then replies keep travelling along it.
 * Used three times on the "proper connections" slide.
 */
export function AnnBConnection({
  label,
  date,
  index,
  step,
}: AnnBConnectionProps) {
  const converted = useDeckStep() >= step;
  const delay = index * 0.2;
  const gradientId = `annb-connection-${index}`;

  return (
    <div className="flex h-[58px] items-center gap-8">
      <div className="w-[150px] shrink-0 text-lg text-white/85">{label}</div>

      <div
        className="relative shrink-0"
        style={{ width: WIDTH, height: HEIGHT }}
      >
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="absolute inset-0 overflow-visible"
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
            fill="none"
            stroke="rgba(255,255,255,0.32)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="2 7"
            initial={{ d: RAGGED, opacity: 1 }}
            animate={
              converted ? { d: TAUT, opacity: 0 } : { d: RAGGED, opacity: 1 }
            }
            transition={cueTransition(converted, delay, {
              d: { duration: PULL, ease: EASE.expo, delay },
              opacity: { duration: PULL * 0.8, ease: EASE.in, delay },
            })}
          />

          <m.path
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ d: RAGGED, pathLength: 0, opacity: 0 }}
            animate={
              converted
                ? { d: TAUT, pathLength: 1, opacity: 1 }
                : { d: RAGGED, pathLength: 0, opacity: 0 }
            }
            transition={cueTransition(converted, delay, {
              d: { duration: PULL, ease: EASE.expo, delay },
              pathLength: { duration: PULL, ease: EASE.inOut, delay },
              opacity: { duration: DUR.fast, delay },
            })}
          />
        </svg>

        {/* A reply travelling the finished wire. One loop per connection. */}
        {converted ? (
          <m.span
            aria-hidden
            className="pointer-events-none absolute left-0 h-[3px] w-16 rounded-full"
            style={{
              top: MID - 1.5,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.95))",
            }}
            initial={{ x: -64, opacity: 0 }}
            animate={{ x: [-64, WIDTH], opacity: [0, 1, 1, 0] }}
            transition={{
              duration: TRIP,
              ease: EASE.inOut,
              times: [0, 0.15, 0.85, 1],
              repeat: Infinity,
              repeatDelay: 1.2,
              delay: delay + PULL + 0.2,
            }}
          />
        ) : null}
      </div>

      <m.div
        className="w-[130px] shrink-0 text-right text-sm tabular-nums"
        initial={{ opacity: 0.35, color: "rgba(255,255,255,0.4)" }}
        animate={{
          opacity: converted ? 1 : 0.35,
          color: converted ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)",
        }}
        transition={cueTransition(converted, delay + 0.45, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      >
        {date}
      </m.div>
    </div>
  );
}
