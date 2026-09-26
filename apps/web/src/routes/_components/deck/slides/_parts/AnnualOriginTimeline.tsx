import { m } from "motion/react";
import { cn } from "@eva/ui";
import { Layer } from "../../_components/DeckCamera";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

/** Design size of the timeline box, matching the slide's content column. */
const TRACK_W = 1088;
/** Vertical centre of the axis inside the box. */
const LINE_Y = 164;
const BOX_H = 256;
/** Room either side of the span so the end dots sit inside the box. */
const INSET = 24;
/** 11 January to 16 September 2026, the span the axis maps. */
const SPAN_DAYS = 248;
/**
 * A label is its name at `text-base leading-snug`, then `mt-1` and the date
 * at `text-sm`. The stem runs the full height of the label, like a flag pole,
 * so it always reads as that label's own.
 */
const LABEL_H = 48;
/** Axis to the shallowest lane, then clear space between stacked lanes. */
const STEM_BASE = 26;
const LANE_GAP = 20;
/** How far each milestone sits in front of the axis it marks. */
const DOT_DEPTH = 24;

interface Milestone {
  /** Days after 11 January 2026. */
  day: number;
  label: string;
  date: string;
  above: boolean;
  /** 0 hugs the axis; 1 stacks a label clear above lane 0. */
  lane: number;
  /** Which side of its stem the label hangs. `end` keeps the last one on stage. */
  anchor: "start" | "end";
  /** Build step that reveals this milestone. */
  step: number;
  /** Stagger position within its step. */
  order: number;
}

/**
 * The January cluster puts three dates inside 90px of axis, so each gets its
 * own lane: the repository high above, the quick task low above, the session
 * below. Each label hangs to one side of its stem, so no stem crosses a label.
 */
// One row per milestone reads as the table it is.
// prettier-ignore
const MILESTONES: readonly Milestone[] = [
  { day: 0, label: "Empty repository", date: "11 January", above: true, lane: 1, anchor: "start", step: 0, order: 0 },
  { day: 13, label: "First session", date: "24 January", above: false, lane: 0, anchor: "start", step: 1, order: 0 },
  { day: 21, label: "First quick task", date: "1 February", above: true, lane: 0, anchor: "start", step: 1, order: 1 },
  { day: 171, label: "Work moves to the cloud", date: "July", above: false, lane: 0, anchor: "start", step: 2, order: 0 },
  { day: 202, label: "Eva starts opening its own work", date: "August", above: true, lane: 0, anchor: "end", step: 2, order: 1 },
];

function xFor(day: number): number {
  return INSET + (day / SPAN_DAYS) * (TRACK_W - INSET * 2);
}

/** Axis to the near edge of a label in `lane`. */
function gapFor(lane: number): number {
  return STEM_BASE + lane * (LABEL_H + LANE_GAP);
}

function MilestoneMark({ item }: { item: Milestone }) {
  const active = useDeckStep() >= item.step;
  const gap = gapFor(item.lane);
  const stem = gap + LABEL_H;
  const delay = item.order * 0.1;

  return (
    <div
      className="absolute"
      style={{
        left: xFor(item.day),
        top: LINE_Y,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Stem, dot and label ride together in front of the axis, so they
          slide along it as the camera dollies but never part from each other. */}
      <Layer depth={DOT_DEPTH}>
        {/* Grows out of the axis towards its label. */}
        <m.div
          aria-hidden
          className={cn(
            "absolute w-px bg-white/20",
            item.above ? "origin-bottom" : "origin-top",
          )}
          style={{ height: stem, top: item.above ? -stem : 0 }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={
            active ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }
          }
          transition={
            active
              ? { type: "spring", bounce: 0, duration: 0.6, delay }
              : { duration: 0.25, ease: EASE_OUT }
          }
        />

        <m.div
          aria-hidden
          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_18px_rgba(139,63,184,0.6)]"
          style={{
            background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: active ? 1 : 0 }}
          transition={
            active
              ? { type: "spring", bounce: 0, duration: 0.5, delay }
              : { duration: 0.2, ease: EASE_OUT }
          }
        />

        <m.div
          className={cn(
            "absolute whitespace-nowrap",
            item.anchor === "start" ? "left-0 pl-3" : "right-0 pr-3 text-right",
          )}
          style={item.above ? { bottom: gap } : { top: gap }}
          initial={{ opacity: 0, y: item.above ? 10 : -10 }}
          animate={
            active
              ? { opacity: 1, y: 0 }
              : { opacity: 0, y: item.above ? 10 : -10 }
          }
          transition={
            active
              ? {
                  type: "spring",
                  bounce: 0,
                  duration: 0.55,
                  delay: delay + 0.1,
                }
              : { duration: 0.25, ease: EASE_OUT }
          }
        >
          <div className="text-base leading-snug font-medium text-white/90">
            {item.label}
          </div>
          <div className="mt-1 text-sm text-white/45">{item.date}</div>
        </m.div>
      </Layer>
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
            d={`M ${INSET} ${LINE_Y} L ${TRACK_W - INSET} ${LINE_Y}`}
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
