import { m } from "motion/react";
import { cn } from "@eva/ui";
import { Layer } from "../../_components/DeckCamera";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, MaskedText, cueTransition } from "../../_components/motion";
import { MoA1Dot, MoA1Rail } from "./MoA1Rail";

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

/** First day of each month from February, as days after 11 January. */
const MONTH_STARTS = [21, 49, 80, 110, 141, 171, 202, 233];
/** Where the lit run rests on each step: 11 Jan, 1 Feb, August, then the end. */
const STOPS = [0, 21, 202, SPAN_DAYS].map((day) => xFor(day) / TRACK_W);
/** The light travels first; each milestone lands as it arrives. */
const LAND = 0.3;
const ORDER_GAP = 0.25;
/** The last milestone is still going on, so its dot keeps breathing. */
const LIVE_LABEL = "Eva starts opening its own work";

function MilestoneMark({ item }: { item: Milestone }) {
  const on = useDeckStep() >= item.step;
  const gap = gapFor(item.lane);
  const stem = gap + LABEL_H;
  const delay = LAND + item.order * ORDER_GAP;

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
            "absolute w-px from-white/30 to-white/5",
            item.above
              ? "origin-bottom bg-gradient-to-t"
              : "origin-top bg-gradient-to-b",
          )}
          style={{ height: stem, top: item.above ? -stem : 0 }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: on ? 1 : 0 }}
          transition={cueTransition(on, delay + 0.1, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        />

        <MoA1Dot
          step={item.step}
          delay={delay}
          liveStep={item.label === LIVE_LABEL ? item.step : undefined}
        />

        <div
          className={cn(
            "absolute whitespace-nowrap",
            item.anchor === "start" ? "left-0 pl-3" : "right-0 pr-3 text-right",
          )}
          style={item.above ? { bottom: gap } : { top: gap }}
        >
          <div className="text-base leading-snug font-medium text-white/90">
            <MaskedText step={item.step} delay={delay + 0.2} stagger={0.05}>
              {item.label}
            </MaskedText>
          </div>
          <m.div
            className="mt-1 text-sm text-white/45"
            initial={{ opacity: 0, y: item.above ? 6 : -6 }}
            animate={
              on ? { opacity: 1, y: 0 } : { opacity: 0, y: item.above ? 6 : -6 }
            }
            transition={cueTransition(on, delay + 0.4, {
              duration: DUR.base,
              ease: EASE.out,
            })}
          >
            {item.date}
          </m.div>
        </div>
      </Layer>
    </div>
  );
}

/**
 * The five beats of Eva's first eight months, drawn along one axis. The axis
 * draws in with a tick per month; a run of brand light then walks it step by
 * step, and each milestone lands as the light reaches it.
 */
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
        <MoA1Rail width={TRACK_W} top={LINE_Y} stops={STOPS} delay={0.35} />
        {MONTH_STARTS.map((day, index) => (
          <m.span
            key={day}
            aria-hidden
            className="absolute h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-white/20"
            style={{ left: xFor(day), top: LINE_Y }}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{
              duration: DUR.base,
              ease: EASE.out,
              delay: 0.6 + index * 0.06,
            }}
          />
        ))}
      </Layer>

      {MILESTONES.map((item) => (
        <MilestoneMark key={item.label} item={item} />
      ))}
    </div>
  );
}
