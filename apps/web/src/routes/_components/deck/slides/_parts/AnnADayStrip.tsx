import { m } from "motion/react";
import { Layer } from "../../_components/DeckCamera";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

export interface AnnADayMark {
  /** Index into `days`. */
  day: number;
  title: string;
  date: string;
  /** Build step that lands this marker. */
  step: number;
}

/** Design size of the strip. */
const TRACK_W = 880;
const BOX_H = 220;
/** Vertical position of the rail inside the box. */
const RAIL_Y = 168;
/** Keeps the first and last day labels inside the box. */
const INSET = 80;
/** Stem length from the rail up to the marker label. */
const STEM = 84;
/** How far the markers sit in front of the rail they mark. */
const DOT_DEPTH = 30;

function xFor(index: number, count: number): number {
  return INSET + (index / (count - 1)) * (TRACK_W - INSET * 2);
}

function Marker({ mark, count }: { mark: AnnADayMark; count: number }) {
  const active = useDeckStep() >= mark.step;

  return (
    <div
      className="absolute"
      style={{
        left: xFor(mark.day, count),
        top: RAIL_Y,
        transformStyle: "preserve-3d",
      }}
    >
      <m.div
        aria-hidden
        className="absolute w-px bg-white/15"
        style={{ height: STEM, top: -STEM }}
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: active ? 0.4 : 0.2, ease: EASE_OUT }}
      />

      <Layer depth={DOT_DEPTH}>
        <m.div
          aria-hidden
          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_20px_rgba(139,63,184,0.65)]"
          style={{
            background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: active ? 1 : 0 }}
          transition={
            active
              ? { type: "spring", bounce: 0.25, duration: 0.6 }
              : { duration: 0.25, ease: EASE_OUT }
          }
        />
      </Layer>

      <m.div
        className="absolute w-[260px] -translate-x-1/2 text-center"
        style={{ left: 0, bottom: STEM }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: active ? 1 : 0, y: active ? 0 : 12 }}
        transition={{
          duration: active ? 0.5 : 0.25,
          ease: EASE_OUT,
          delay: active ? 0.1 : 0,
        }}
      >
        <div className="text-3xl leading-tight font-semibold text-white">
          {mark.title}
        </div>
        <div className="mt-2 text-sm text-white/45">{mark.date}</div>
      </m.div>
    </div>
  );
}

/**
 * A short calendar rail: every day gets a tick, and the days that mattered get
 * a marker that lands on its own build step.
 */
export function AnnADayStrip({
  days,
  marks,
}: {
  days: readonly string[];
  marks: readonly AnnADayMark[];
}) {
  return (
    <div
      className="relative"
      style={{ width: TRACK_W, height: BOX_H, transformStyle: "preserve-3d" }}
    >
      <Layer depth={0}>
        <svg
          aria-hidden
          width={TRACK_W}
          height={BOX_H}
          className="absolute inset-0"
        >
          <defs>
            {/* userSpaceOnUse: a horizontal line has a zero-height bounding
              box, so the default gradient units collapse it. */}
            <linearGradient
              id="anna-day-strip"
              gradientUnits="userSpaceOnUse"
              x1={0}
              x2={TRACK_W}
              y1={RAIL_Y}
              y2={RAIL_Y}
            >
              <stop offset="0%" stopColor={BRAND.purple} stopOpacity="0.3" />
              <stop offset="50%" stopColor={BRAND.purple} />
              <stop offset="100%" stopColor={BRAND.blue} />
            </linearGradient>
          </defs>
          <m.path
            d={`M 24 ${RAIL_Y} L ${TRACK_W - 24} ${RAIL_Y}`}
            stroke="url(#anna-day-strip)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.3 }}
          />
        </svg>
      </Layer>

      {days.map((day, index) => (
        <m.div
          key={day}
          className="absolute -translate-x-1/2 text-center text-sm text-white/40"
          style={{ left: xFor(index, days.length), top: RAIL_Y + 20 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.4,
            ease: EASE_OUT,
            delay: 0.6 + index * 0.08,
          }}
        >
          {day}
        </m.div>
      ))}

      {marks.map((mark) => (
        <Marker key={mark.title} mark={mark} count={days.length} />
      ))}
    </div>
  );
}
