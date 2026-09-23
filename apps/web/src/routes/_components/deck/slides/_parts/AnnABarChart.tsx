import { m } from "motion/react";
import { BRAND, EASE_OUT } from "../../_components/DeckPrimitives";

export interface AnnABar {
  label: string;
  value: number;
}

interface AnnABarChartProps {
  bars: readonly AnnABar[];
  /** Column width in pixels. The gap sits between columns. */
  colWidth: number;
  gap: number;
  /** Pixel height of the tallest column. */
  barMax: number;
  /** Columns grow once this is true, so a chart can wait for its build step. */
  active?: boolean;
  /** Seconds before the first column starts. */
  delay?: number;
  /** Column indices that stay lit once `focused` is true. */
  focus?: readonly number[];
  focused?: boolean;
  className?: string;
}

const FORMAT = new Intl.NumberFormat("en-GB").format;
/** Seconds between one column starting and the next. */
const STAGGER = 0.07;
/** A very short column still reads as a column rather than a hairline. */
const MIN_H = 4;

function Column({
  bar,
  colWidth,
  height,
  dim,
  active,
  delay,
}: {
  bar: AnnABar;
  colWidth: number;
  height: number;
  dim: boolean;
  active: boolean;
  delay: number;
}) {
  return (
    <m.div
      className="flex flex-col justify-end"
      style={{ width: colWidth }}
      animate={{ opacity: dim ? 0.28 : 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <m.div
        className="text-center text-sm tabular-nums text-white/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{
          duration: active ? 0.4 : 0.2,
          ease: EASE_OUT,
          delay: active ? delay + 0.3 : 0,
        }}
      >
        {FORMAT(bar.value)}
      </m.div>
      <m.div
        aria-hidden
        className="mt-2 w-full rounded-t-[6px]"
        style={{
          height,
          transformOrigin: "bottom",
          background: `linear-gradient(to top, ${BRAND.blue}, ${BRAND.purple})`,
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: active ? 1 : 0 }}
        transition={{
          duration: active ? 0.6 : 0.25,
          ease: EASE_OUT,
          delay: active ? delay : 0,
        }}
      />
    </m.div>
  );
}

/**
 * A column chart that grows out of its baseline, with an optional focus pass
 * that dims every column except the ones named. Shared by the quarter slide's
 * three-bar inset and the nine-month chart, so both read as the same object.
 */
export function AnnABarChart({
  bars,
  colWidth,
  gap,
  barMax,
  active = true,
  delay = 0,
  focus = [],
  focused = false,
  className,
}: AnnABarChartProps) {
  const peak = bars.reduce((high, bar) => Math.max(high, bar.value), 1);
  const trackW = bars.length * colWidth + (bars.length - 1) * gap;

  return (
    <div className={className} style={{ width: trackW }}>
      <div className="flex items-end" style={{ gap }}>
        {bars.map((bar, index) => (
          <Column
            key={bar.label}
            bar={bar}
            colWidth={colWidth}
            height={Math.max(MIN_H, (bar.value / peak) * barMax)}
            dim={focused && !focus.includes(index)}
            active={active}
            delay={delay + index * STAGGER}
          />
        ))}
      </div>

      <m.div
        className="mt-3 flex"
        style={{ gap }}
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{
          duration: active ? 0.4 : 0.25,
          ease: EASE_OUT,
          delay: active ? delay : 0,
        }}
      >
        {bars.map((bar) => (
          <div
            key={bar.label}
            className="text-center text-xs text-white/45"
            style={{ width: colWidth }}
          >
            {bar.label}
          </div>
        ))}
      </m.div>
    </div>
  );
}
