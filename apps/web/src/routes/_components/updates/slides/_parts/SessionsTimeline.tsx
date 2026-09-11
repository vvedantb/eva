import { m } from "motion/react";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

/** Design width of the timeline, matching the slide's content column. */
const TRACK_W = 1088;
/** Vertical centre of the track inside the timeline box. */
const LINE_Y = 200;
const BOX_H = 384;
/** Left and right breathing room so the first and last label cards fit. */
const INSET = 90;
/** 1 July to 10 September 2026, the span the axis maps. */
const SPAN_DAYS = 71;
const CARD_W = 124;
/** Two label lanes; the second is used when neighbours sit too close. */
const LANE_OFFSET: readonly number[] = [28, 104];
const MIN_GAP = 132;

interface Milestone {
  /** Days after 1 July 2026. */
  day: number;
  label: string;
  date: string;
  /** Build step that reveals this milestone. */
  step: number;
}

const MILESTONES: readonly Milestone[] = [
  { day: 8, label: "Follow-up queue", date: "9 Jul", step: 1 },
  { day: 17, label: "Built-in browser tab", date: "18 Jul", step: 1 },
  { day: 20, label: "Files explorer", date: "21 Jul", step: 1 },
  { day: 21, label: "Sessions in the sidebar everywhere", date: "22 Jul", step: 1 },
  { day: 24, label: "Plan mode", date: "25 Jul", step: 1 },
  { day: 28, label: "Browser-style tabs", date: "29 Jul", step: 1 },
  { day: 31, label: "Inbox badge and chime", date: "1 Aug", step: 2 },
  { day: 47, label: "Works on mobile", date: "17 Aug", step: 2 },
  { day: 52, label: "Usage limits shown up front", date: "22 Aug", step: 2 },
  { day: 58, label: "Auto-archive notices", date: "28 Aug", step: 2 },
  { day: 65, label: "Switch account when a limit hits", date: "4 Sep", step: 3 },
  { day: 71, label: "Fewer stuck turns", date: "10 Sep", step: 3 },
];

const MONTHS: readonly { name: string; centre: number }[] = [
  { name: "July", centre: 0.225 },
  { name: "August", centre: 0.635 },
  { name: "September", centre: 0.91 },
];

interface Placed extends Milestone {
  x: number;
  above: boolean;
  lane: number;
  /** Index within its build step, used for the stagger. */
  order: number;
}

/**
 * Lays the milestones out along the axis: x from the date, sides alternating,
 * and a second lane whenever a neighbour on the same side is closer than a
 * label card is wide. Pure, so it can run during render.
 */
function place(): Placed[] {
  const lastOnLane = new Map<string, number>();
  const seenInStep = new Map<number, number>();

  return MILESTONES.map((milestone, index) => {
    const x = INSET + (milestone.day / SPAN_DAYS) * (TRACK_W - INSET * 2);
    const above = index % 2 === 0;
    const side = above ? "up" : "down";
    let lane = 0;
    while (lane < LANE_OFFSET.length - 1) {
      const last = lastOnLane.get(`${side}-${lane}`);
      if (last === undefined || x - last >= MIN_GAP) break;
      lane += 1;
    }
    lastOnLane.set(`${side}-${lane}`, x);
    const order = seenInStep.get(milestone.step) ?? 0;
    seenInStep.set(milestone.step, order + 1);
    return { ...milestone, x, above, lane, order };
  });
}

function Milestone({ item }: { item: Placed }) {
  const active = useDeckStep() >= item.step;
  const stem = LANE_OFFSET[item.lane];
  const delay = item.order * 0.1;

  return (
    <div className="absolute" style={{ left: item.x, top: LINE_Y }}>
      <m.div
        aria-hidden
        className="absolute w-px bg-white/15"
        style={{ height: stem, top: item.above ? -stem : 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT, delay: active ? delay : 0 }}
      />

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

      <m.div
        className="absolute -translate-x-1/2 text-center"
        style={
          item.above
            ? { width: CARD_W, left: 0, bottom: stem }
            : { width: CARD_W, left: 0, top: stem }
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

export function SessionsTimeline() {
  const placed = place();

  return (
    <div className="relative" style={{ width: TRACK_W, height: BOX_H }}>
      <svg
        aria-hidden
        width={TRACK_W}
        height={BOX_H}
        className="absolute inset-0"
      >
        <defs>
          {/* userSpaceOnUse: a horizontal line has a zero-height bounding box,
              which makes the default objectBoundingBox gradient degenerate. */}
          <linearGradient
            id="sessions-timeline-line"
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
          stroke="url(#sessions-timeline-line)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: EASE_OUT, delay: 0.4 }}
        />
      </svg>

      {MONTHS.map((month, index) => (
        <m.div
          key={month.name}
          className="absolute top-0 -translate-x-1/2 text-xs tracking-[0.2em] text-white/40 uppercase"
          style={{ left: month.centre * TRACK_W }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.5,
            ease: EASE_OUT,
            delay: 0.6 + index * 0.12,
          }}
        >
          {month.name}
        </m.div>
      ))}

      {placed.map((item) => (
        <Milestone key={item.label} item={item} />
      ))}
    </div>
  );
}
