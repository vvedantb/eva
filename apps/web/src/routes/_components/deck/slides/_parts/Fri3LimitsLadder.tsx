import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import {
  DUR,
  DrawPath,
  EASE,
  SETTLE,
  cueTransition,
} from "../../_components/motion";

/** The shared time axis: 1 February to 1 October 2026, left to right. */
const START = Date.UTC(2026, 1, 1);
const END = Date.UTC(2026, 9, 1);
export const FRI3_PLOT_X = 224;
export const FRI3_PLOT_W = 848;

export function fri3X(date: string): number {
  const at = Date.parse(`${date}T00:00:00Z`);
  return FRI3_PLOT_X + ((at - START) / (END - START)) * FRI3_PLOT_W;
}

/** The day each model first appeared in Eva's model picker (git history). */
const MODELS: readonly { label: string; date: string }[] = [
  { label: "Opus 4.5", date: "2026-04-14" },
  { label: "Opus 4.6", date: "2026-04-17" },
  { label: "GPT-5.5", date: "2026-05-11" },
  { label: "Fable 5", date: "2026-06-10" },
  { label: "Grok 4.5", date: "2026-07-10" },
  { label: "GPT-5.6", date: "2026-08-10" },
  { label: "Grok 4.6", date: "2026-08-12" },
  { label: "Fable 5.1", date: "2026-09-01" },
  { label: "GPT-6 Astra", date: "2026-09-11" },
  { label: "Grok 4.7", date: "2026-09-21" },
];

export const FRI3_LADDER_H = 200;
/** The ladder starts on the time axis, which the slide draws on entry. */
export const FRI3_BASE_Y = FRI3_LADDER_H - 2;
const BASE_Y = FRI3_BASE_Y;
const RISE = 17;
const DRAW_AT = 0.15;
const DRAW = 2.2;

const POINTS = MODELS.map((model, index) => ({
  ...model,
  x: fri3X(model.date),
  y: BASE_Y - (index + 1) * RISE,
}));

/** One step per model: along to its date, then up. */
const LADDER = POINTS.reduce(
  (d, point) => `${d} H ${point.x.toFixed(1)} V ${point.y}`,
  `M ${FRI3_PLOT_X} ${BASE_Y}`,
);

/** How far along the drawn line each step sits, 0 to 1. */
const LENGTHS = POINTS.map((point, index) => {
  const prevX = index === 0 ? FRI3_PLOT_X : (POINTS[index - 1]?.x ?? 0);
  return point.x - prevX + RISE;
});
const TOTAL = LENGTHS.reduce((sum, length) => sum + length, 0);
const FRACTIONS = LENGTHS.map(
  (_, index) =>
    LENGTHS.slice(0, index + 1).reduce((sum, length) => sum + length, 0) /
    TOTAL,
);

/** Seconds into the draw when the ease reaches `progress`, so each dot lands as the line does. */
function timeAt(progress: number): number {
  const [x1, y1, x2, y2] = EASE.inOut;
  const curve = (a: number, b: number, s: number) =>
    3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (curve(y1, y2, mid) < progress) low = mid;
    else high = mid;
  }
  return curve(x1, x2, (low + high) / 2) * DRAW;
}

/** Each model joining Eva is one step up the ladder. Step 1 draws it. */
export function Fri3LimitsLadder() {
  const step = useDeckStep();
  const on = step >= 1;

  return (
    <m.div
      className="absolute inset-x-0 top-0"
      style={{ height: FRI3_LADDER_H }}
      animate={{ opacity: step >= 2 ? 0.5 : 1 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <m.span
        className="absolute top-[150px] left-0 text-sm text-white/50"
        initial={{ opacity: 0, x: -8 }}
        animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
        transition={cueTransition(on, 0.1, { duration: DUR.slow })}
      >
        Models added to Eva
      </m.span>

      <DrawPath
        d={LADDER}
        width={FRI3_PLOT_X + FRI3_PLOT_W}
        height={FRI3_LADDER_H}
        step={1}
        delay={DRAW_AT}
        duration={DRAW}
        strokeWidth={2.5}
        dot
      />

      {POINTS.map((point, index) => {
        const at = DRAW_AT + timeAt(FRACTIONS[index] ?? 1);
        return (
          <div key={point.label}>
            <m.span
              aria-hidden
              className="absolute size-2.5 rounded-full bg-white"
              style={{ left: point.x - 5, top: point.y - 5 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={cueTransition(on, at, SETTLE)}
            />
            <div
              className="absolute -translate-x-full -translate-y-1/2"
              style={{ left: point.x - 10, top: point.y }}
            >
              <m.span
                className="block text-xs whitespace-nowrap text-white/70"
                initial={{ opacity: 0, y: 6 }}
                animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                transition={cueTransition(on, at + 0.05, {
                  duration: DUR.base,
                  ease: EASE.out,
                })}
              >
                {point.label}
              </m.span>
            </div>
          </div>
        );
      })}
    </m.div>
  );
}
