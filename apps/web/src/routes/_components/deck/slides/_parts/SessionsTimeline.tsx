import { m } from "motion/react";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, LEAVE, Spotlight } from "../../_components/motion";
import { LEAD, MoF1Milestone } from "./MoF1SessionsMilestone";
import type { Run } from "./MoF1SessionsMilestone";
import {
  BOX_H,
  LINE_Y,
  MONTHS,
  TRACK_W,
  place,
} from "./sessionsTimelineLayout";
import type { Placed } from "./sessionsTimelineLayout";

const START = 16;
const END = TRACK_W - START;
const STEPS = 3;
/** Time runs at an even pace, so each light-up lands as the head passes. */
const PACE = 560;
/** The glow's box overhangs the timeline by this much, so its edge never shows. */
const GLOW_BLEED = 96;

/** Where the lit part of the axis runs on each step: to that month's last milestone. */
function runs(placed: readonly Placed[]): Run[] {
  const out: Run[] = [];
  let from = START;
  for (let step = 1; step <= STEPS; step += 1) {
    const xs = placed.filter((item) => item.step === step).map((i) => i.x);
    const to = Math.max(from, ...xs) + 14;
    out.push({ from, to, duration: Math.max(0.55, (to - from) / PACE) });
    from = to;
  }
  return out;
}

function MonthLabel({ index }: { index: number }) {
  const step = useDeckStep();
  const month = MONTHS[index];
  if (!month) return null;
  const tone = step === index + 1 ? 0.9 : step > index + 1 ? 0.5 : 0.35;
  return (
    <m.div
      className="absolute top-0 -translate-x-1/2 text-xs tracking-[0.2em] text-white uppercase"
      style={{ left: month.centre * TRACK_W }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: tone, y: 0 }}
      transition={{
        duration: DUR.slow,
        ease: EASE.out,
        delay: step === 0 ? 0.6 + index * 0.12 : 0,
      }}
    >
      {month.name}
    </m.div>
  );
}

export function SessionsTimeline() {
  const step = useDeckStep();
  const placed = place();
  const lit = runs(placed);
  const current = lit[Math.min(step, STEPS) - 1];
  const head = current?.to ?? START;
  const length = END - START;

  return (
    <div className="relative isolate" style={{ width: TRACK_W, height: BOX_H }}>
      <Spotlight
        shots={[
          null,
          ...lit.map((run) => ({
            x: (run.from + run.to) / 2 + GLOW_BLEED,
            y: LINE_Y + GLOW_BLEED,
            size: Math.min(600, Math.max(440, (run.to - run.from) * 1.3)),
          })),
        ]}
        className="-inset-24"
      />
      <svg
        aria-hidden
        width={TRACK_W}
        height={BOX_H}
        className="absolute inset-0 overflow-visible"
      >
        <defs>
          {/* userSpaceOnUse: a horizontal line has a zero-height bounding box. */}
          <linearGradient
            id="sessions-timeline-line"
            gradientUnits="userSpaceOnUse"
            x1={0}
            x2={TRACK_W}
            y1={LINE_Y}
            y2={LINE_Y}
          >
            <stop offset="0%" stopColor={BRAND.purple} />
            <stop offset="100%" stopColor={BRAND.blue} />
          </linearGradient>
        </defs>
        <m.path
          d={`M ${START} ${LINE_Y} L ${END} ${LINE_Y}`}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: EASE.inOut, delay: 0.4 }}
        />
        {/* Time passing: the lit axis runs forward to this month's last change. */}
        <m.path
          d={`M ${START} ${LINE_Y} L ${END} ${LINE_Y}`}
          stroke="url(#sessions-timeline-line)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: (head - START) / length,
            opacity: step > 0 ? 1 : 0,
          }}
          transition={
            current
              ? { duration: current.duration, ease: "linear", delay: LEAD }
              : LEAVE
          }
        />
      </svg>
      <m.span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 size-6 rounded-full"
        style={{
          top: LINE_Y - 12,
          left: -12,
          background:
            "radial-gradient(circle closest-side, #fff 0 18%, rgba(130,170,255,0.55) 42%, transparent)",
        }}
        initial={{ x: START, opacity: 0 }}
        animate={{
          x: head,
          opacity: current ? [0, 1, 1, 0] : 0,
        }}
        transition={
          current
            ? {
                x: { duration: current.duration, ease: "linear", delay: LEAD },
                opacity: {
                  duration: current.duration + 0.35,
                  times: [0, 0.1, 0.8, 1],
                  delay: LEAD,
                },
              }
            : LEAVE
        }
      />

      {MONTHS.map((month, index) => (
        <MonthLabel key={month.name} index={index} />
      ))}

      {placed.map((item) => {
        const run = lit[item.step - 1];
        return run ? (
          <MoF1Milestone key={item.label} item={item} run={run} />
        ) : null;
      })}
    </div>
  );
}
