import { m } from "motion/react";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

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

const TRACK_W = MONTHS.length * COL_W + (MONTHS.length - 1) * GAP;
const HIGHLIGHT_LEFT = HIGHLIGHT_FROM * (COL_W + GAP);
const HIGHLIGHT_W = TRACK_W - HIGHLIGHT_LEFT;

function barHeight(sessions: number): number {
  return sessions === 0 ? STUB_H : (sessions / PEAK) * BAR_MAX_H;
}

function Column({ bar, index }: { bar: MonthBar; index: number }) {
  const step = useDeckStep();
  const dimmed = step >= 1 && index < HIGHLIGHT_FROM;

  return (
    <m.div
      className="flex flex-col justify-end"
      style={{ width: COL_W, height: PLOT_H }}
      animate={{ opacity: dimmed ? 0.45 : 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <m.div
        className="text-center text-xs tabular-nums text-white/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.4,
          ease: EASE_OUT,
          delay: 0.5 + index * 0.08,
        }}
      >
        {bar.sessions}
      </m.div>
      <m.div
        aria-hidden
        className="mt-2 w-full rounded-t-md"
        style={{
          height: barHeight(bar.sessions),
          transformOrigin: "bottom",
          background: `linear-gradient(to top, ${BRAND.blue}, ${BRAND.purple})`,
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{
          duration: 0.6,
          ease: EASE_OUT,
          delay: 0.3 + index * 0.08,
        }}
      />
    </m.div>
  );
}

/** Monthly bar chart of sessions raised in Eva, with a July-onwards highlight. */
export function AnnualAdoptionChart() {
  const step = useDeckStep();

  return (
    <div className="relative" style={{ width: TRACK_W }}>
      <m.div
        aria-hidden
        className="pointer-events-none absolute rounded-3xl blur-2xl"
        style={{
          left: HIGHLIGHT_LEFT - 12,
          width: HIGHLIGHT_W + 24,
          top: 40,
          height: PLOT_H - 20,
          background: `linear-gradient(to top, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: step >= 1 ? 0.3 : 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      />

      <m.div
        className="absolute top-2 left-0 max-w-[470px] text-sm leading-snug text-white/75"
        initial={{ opacity: 0, y: 8 }}
        animate={{
          opacity: step >= 1 ? 1 : 0,
          y: step >= 1 ? 0 : 8,
        }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 }}
      >
        Cloud workspaces arrived in July. Use tripled and stayed there.
      </m.div>

      <div className="relative flex items-end" style={{ gap: GAP }}>
        {MONTHS.map((bar, index) => (
          <Column key={bar.month} bar={bar} index={index} />
        ))}
      </div>

      <div className="mt-3 flex" style={{ gap: GAP }}>
        {MONTHS.map((bar) => (
          <div
            key={bar.month}
            className="text-center text-xs text-white/45"
            style={{ width: COL_W }}
          >
            {bar.month}
          </div>
        ))}
      </div>
    </div>
  );
}
