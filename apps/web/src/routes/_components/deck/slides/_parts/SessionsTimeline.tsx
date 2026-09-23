import { m } from "motion/react";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";
import {
  BOX_H,
  CARD_W,
  LINE_Y,
  MONTHS,
  TRACK_W,
  place,
} from "./sessionsTimelineLayout";
import type { Placed } from "./sessionsTimelineLayout";

function Milestone({ item }: { item: Placed }) {
  const active = useDeckStep() >= item.step;
  const stem = item.stem;
  const delay = item.order * 0.1;

  return (
    <div className="absolute" style={{ left: item.x, top: LINE_Y }}>
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
        <div className="text-sm leading-snug font-medium text-balance text-white/90">
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
