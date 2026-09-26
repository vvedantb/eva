import { m } from "motion/react";
import { cn } from "@eva/ui";
import { CountUp } from "../../_components/CountUp";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import {
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";

interface MonthBar {
  month: string;
  sessions: number;
}

/** Sessions created per calendar month, 2026. June is genuinely zero. */
const MONTHS: readonly MonthBar[] = [
  { month: "Jan", sessions: 13 },
  { month: "Feb", sessions: 11 },
  { month: "Mar", sessions: 31 },
  { month: "Apr", sessions: 28 },
  { month: "May", sessions: 9 },
  { month: "Jun", sessions: 0 },
  { month: "Jul", sessions: 75 },
  { month: "Aug", sessions: 109 },
  { month: "Sep", sessions: 91 },
];

const COL_W = 96;
const GAP = 16;
/** Height of the plot area, including the value label above each bar. */
const PLOT_H = 230;
const BAR_MAX_H = 196;
const PEAK = 109;
/** A zero month still gets a visible stub rather than disappearing. */
const STUB_H = 3;
/** Index of the first highlighted month (July). */
const HIGHLIGHT_FROM = 6;
/** Bars rise left to right on entry; the value above each counts with it. */
const RISE_AT = (index: number) => 0.45 + index * 0.07;

const TRACK_W = MONTHS.length * COL_W + (MONTHS.length - 1) * GAP;
const HIGHLIGHT_LEFT = HIGHLIGHT_FROM * (COL_W + GAP);
const HIGHLIGHT_W = TRACK_W - HIGHLIGHT_LEFT;
/** The July marker sits in the gap before the first highlighted bar. */
const MARKER_X = HIGHLIGHT_LEFT - GAP / 2;
/** Faint value guides at a third, two thirds and the full bar height. */
const GUIDES = [1, 2, 3].map((part) => PLOT_H - (BAR_MAX_H * part) / 3);

function barHeight(sessions: number): number {
  return sessions === 0 ? STUB_H : (sessions / PEAK) * BAR_MAX_H;
}

function Bar({ sessions }: { sessions: number }) {
  return (
    <div
      aria-hidden
      style={{
        height: barHeight(sessions),
        background: `linear-gradient(to top, ${BRAND.blue}, ${BRAND.purple})`,
      }}
    />
  );
}

function Column({ bar, index }: { bar: MonthBar; index: number }) {
  const step = useDeckStep();
  const later = index >= HIGHLIGHT_FROM;
  const dimmed = step >= 1 && !later;
  const at = RISE_AT(index);

  return (
    <m.div
      className="flex flex-col justify-end"
      style={{ width: COL_W, height: PLOT_H }}
      animate={{ opacity: dimmed ? 0.38 : 1 }}
      transition={{ duration: DUR.slow, ease: EASE.expo }}
    >
      <m.div
        className={cn(
          "text-center text-xs tabular-nums",
          later && step >= 1 ? "text-white" : "text-white/70",
        )}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE.out, delay: at + 0.1 }}
      >
        <CountUp value={bar.sessions} duration={1} delay={at} />
      </m.div>
      <m.div
        className="mt-2 w-full origin-bottom"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.1, ease: EASE.expo, delay: at }}
      >
        {later ? (
          <Sheen
            step={1}
            delay={0.35 + (index - HIGHLIGHT_FROM) * 0.12}
            className="rounded-t-md"
          >
            <Bar sessions={bar.sessions} />
          </Sheen>
        ) : (
          <div className="overflow-hidden rounded-t-md">
            <Bar sessions={bar.sessions} />
          </div>
        )}
      </m.div>
    </m.div>
  );
}

/** Monthly bar chart of sessions raised in Eva, with a July-onwards highlight. */
export function AnnualAdoptionChart() {
  const lit = useDeckStep() >= 1;

  return (
    <div className="relative" style={{ width: TRACK_W }}>
      {/* The glow is a painted radial, so fading it is opacity only. */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: HIGHLIGHT_LEFT - 80,
          width: HIGHLIGHT_W + 160,
          top: -10,
          height: PLOT_H + 70,
          background: `radial-gradient(closest-side, ${BRAND.purple}55, ${BRAND.blue}22 55%, transparent)`,
        }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={lit ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
        transition={cueTransition(lit, 0.1)}
      />

      {GUIDES.map((top, index) => (
        <m.div
          key={top}
          aria-hidden
          className="absolute inset-x-0 h-px origin-left bg-white/[0.06]"
          style={{ top }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{
            duration: 1.2,
            ease: EASE.expo,
            delay: 0.2 + index * 0.08,
          }}
        />
      ))}

      <div className="absolute top-0" style={{ left: MARKER_X - 1 }}>
        <DrawPath
          d={`M1 0 L1 ${PLOT_H + 26}`}
          width={2}
          height={PLOT_H + 26}
          step={1}
          duration={0.8}
          strokeWidth={1}
          color="rgba(255,255,255,0.35)"
        />
      </div>

      <p className="absolute top-2 left-0 max-w-[470px] text-sm leading-snug text-white/75">
        <MaskedText step={1} delay={0.25} duration={DUR.slow} stagger={0.035}>
          Cloud workspaces arrived in July. Use tripled and stayed there.
        </MaskedText>
      </p>

      <div className="relative flex items-end" style={{ gap: GAP }}>
        {MONTHS.map((bar, index) => (
          <Column key={bar.month} bar={bar} index={index} />
        ))}
      </div>

      <div className="mt-3 flex" style={{ gap: GAP }}>
        {MONTHS.map((bar, index) => (
          <m.div
            key={bar.month}
            className="text-center text-xs text-white/45"
            style={{ width: COL_W }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DUR.base, delay: RISE_AT(index) + 0.2 }}
          >
            {bar.month}
          </m.div>
        ))}
      </div>
    </div>
  );
}
