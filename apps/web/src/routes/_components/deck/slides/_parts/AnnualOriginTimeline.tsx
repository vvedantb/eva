import { m } from "motion/react";
import { Layer } from "../../_components/DeckCamera";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

/** Design size of the timeline box. */
const TRACK_W = 1080;
const BOX_H = 330;
/** Vertical centre of the axis inside the box. */
const LINE_Y = 168;
/** Breathing room so the first and last labels stay inside the box. */
const INSET = 90;
/** 11 January to 16 September 2026, the span the axis maps. */
const SPAN_DAYS = 248;
/** Stem lengths for the two label lanes. */
const LANE: readonly number[] = [30, 100];
/** How far the milestone dots sit in front of the axis they mark. */
const DOT_DEPTH = 30;

interface Milestone {
  /** Days after 11 January 2026. */
  day: number;
  label: string;
  date: string;
  above: boolean;
  lane: number;
  width: number;
  /** Build step that reveals this milestone. */
  step: number;
  /** Stagger position within its step. */
  order: number;
}

const MILESTONES: readonly Milestone[] = [
  {
    day: 0,
    label: "Empty repository",
    date: "11 January",
    above: true,
    lane: 0,
    width: 150,
    step: 0,
    order: 0,
  },
  {
    day: 13,
    label: "First session",
    date: "24 January",
    above: false,
    lane: 0,
    width: 150,
    step: 1,
    order: 0,
  },
  {
    day: 21,
    label: "First quick task",
    date: "1 February",
    above: true,
    lane: 1,
    width: 150,
    step: 1,
    order: 1,
  },
  {
    day: 171,
    label: "Work moves to the cloud",
    date: "July",
    above: false,
    lane: 0,
    width: 170,
    step: 2,
    order: 0,
  },
  {
    day: 202,
    label: "Eva starts opening its own work",
    date: "August",
    above: true,
    lane: 0,
    width: 220,
    step: 2,
    order: 1,
  },
];

function xFor(day: number): number {
  return INSET + (day / SPAN_DAYS) * (TRACK_W - INSET * 2);
}

function MilestoneMark({ item }: { item: Milestone }) {
  const active = useDeckStep() >= item.step;
  const stem = LANE[item.lane];
  const delay = item.order * 0.12;

  return (
    <div
      className="absolute"
      style={{
        left: xFor(item.day),
        top: LINE_Y,
        transformStyle: "preserve-3d",
      }}
    >
      <m.div
        aria-hidden
        className="absolute w-px bg-white/15"
        style={{ height: stem, top: item.above ? -stem : 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{
          duration: 0.4,
          ease: EASE_OUT,
          delay: active ? delay : 0,
        }}
      />

      {/* The dot rides in front of the axis, so it keeps its own mark as the
          camera dollies along the line. */}
      <Layer depth={DOT_DEPTH}>
        <m.div
          aria-hidden
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_18px_rgba(139,63,184,0.6)]"
          style={{
            background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: active ? 1 : 0 }}
          transition={{
            type: "spring",
            bounce: 0.25,
            duration: 0.6,
            delay: active ? delay : 0,
          }}
        />
      </Layer>

      <m.div
        className="absolute -translate-x-1/2 text-center"
        style={
          item.above
            ? { width: item.width, left: 0, bottom: stem }
            : { width: item.width, left: 0, top: stem }
        }
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: active ? 1 : 0, y: active ? 0 : 10 }}
        transition={{
          duration: 0.45,
          ease: EASE_OUT,
          delay: active ? delay + 0.08 : 0,
        }}
      >
        <div className="text-sm leading-snug font-medium text-white/90">
          {item.label}
        </div>
        <div className="mt-1 text-xs text-white/45">{item.date}</div>
      </m.div>
    </div>
  );
}

/** The five beats of Eva's first eight months, drawn along one axis. */
export function AnnualOriginTimeline() {
  return (
    <div
      className="relative"
      style={{
        width: TRACK_W,
        height: BOX_H,
        transformStyle: "preserve-3d",
      }}
    >
      <Layer depth={0}>
        <svg
          aria-hidden
          width={TRACK_W}
          height={BOX_H}
          className="absolute inset-0"
        >
          <defs>
            {/* userSpaceOnUse: a horizontal line has a zero-height bounding box,
              so the default objectBoundingBox gradient collapses. */}
            <linearGradient
              id="annual-origin-line"
              gradientUnits="userSpaceOnUse"
              x1={0}
              x2={TRACK_W}
              y1={LINE_Y}
              y2={LINE_Y}
            >
              <stop offset="0%" stopColor={BRAND.purple} stopOpacity="0.25" />
              <stop offset="45%" stopColor={BRAND.purple} />
              <stop offset="100%" stopColor={BRAND.blue} />
            </linearGradient>
          </defs>
          <m.path
            d={`M 16 ${LINE_Y} L ${TRACK_W - 16} ${LINE_Y}`}
            stroke="url(#annual-origin-line)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.4, ease: EASE_OUT, delay: 0.4 }}
          />
        </svg>
      </Layer>

      {MILESTONES.map((item) => (
        <MilestoneMark key={item.label} item={item} />
      ))}
    </div>
  );
}
