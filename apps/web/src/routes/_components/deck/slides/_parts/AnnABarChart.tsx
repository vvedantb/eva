import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, Sheen, cueTransition } from "../../_components/motion";

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
  /** Build step the columns grow on. */
  step?: number;
  /** Seconds before the first column starts. */
  delay?: number;
  /** Column indices that stay lit while `focused` is true. */
  focus?: readonly number[];
  focused?: boolean;
  /** Build step on which a band of light crosses the focused columns. */
  sheenStep?: number;
  className?: string;
}

/** Seconds between one column starting and the next. */
const STAGGER = 0.06;
/** A very short column still reads as a column rather than a hairline. */
const MIN_H = 4;
/** Columns grow on the deck's long expo, so the tall ones feel heavy. */
const GROW = 1.1;
const LABEL_H = 20;

function Column({
  bar,
  colWidth,
  height,
  index,
  lit,
  dim,
  on,
  step,
  delay,
  sheenStep,
}: {
  bar: AnnABar;
  colWidth: number;
  height: number;
  index: number;
  lit: boolean;
  dim: boolean;
  on: boolean;
  step: number;
  delay: number;
  sheenStep?: number;
}) {
  const grow = cueTransition(on, delay, { duration: GROW, ease: EASE.expo });
  const column = (
    <div
      className="relative w-full overflow-hidden rounded-t-[6px]"
      style={{
        height,
        background: `linear-gradient(to top, ${BRAND.blue}, ${BRAND.purple})`,
      }}
    >
      {/* A lit top edge, so each column reads as a solid with a face. */}
      <span className="absolute inset-x-0 top-0 h-px bg-white/45" />
      <span className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/15 to-transparent" />
    </div>
  );

  return (
    <m.div
      className="flex flex-col justify-end"
      style={{ width: colWidth }}
      initial={false}
      animate={{ opacity: dim ? 0.26 : 1 }}
      // Dimming is quick; relighting runs left to right as a wave.
      transition={{
        duration: dim ? DUR.base : DUR.slow,
        ease: EASE.out,
        delay: dim ? 0 : index * 0.04,
      }}
    >
      {/* The value rides up on the top of its column, counting as it goes. */}
      <m.div
        className="text-center tabular-nums"
        style={{ height: LABEL_H }}
        initial={{ opacity: 0, y: height }}
        animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: height }}
        transition={cueTransition(on, delay, {
          duration: GROW,
          ease: EASE.expo,
          opacity: { duration: DUR.base, delay: delay + 0.1 },
        })}
      >
        <m.span
          className="inline-block origin-bottom text-sm"
          initial={false}
          animate={{
            scale: lit ? 1.25 : 1,
            color: lit ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.7)",
          }}
          transition={{ duration: DUR.slow, ease: EASE.expo }}
        >
          <CountUp
            value={bar.value}
            step={step}
            delay={delay}
            duration={GROW}
          />
        </m.span>
      </m.div>
      <m.div
        aria-hidden
        className="mt-2 w-full origin-bottom"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: on ? 1 : 0 }}
        transition={grow}
      >
        {lit && sheenStep !== undefined ? (
          <Sheen
            step={sheenStep}
            delay={0.2 + index * 0.05}
            duration={1.2}
            className="rounded-t-[6px]"
          >
            {column}
          </Sheen>
        ) : (
          column
        )}
      </m.div>
    </m.div>
  );
}

/**
 * A column chart. A baseline draws first, then the columns grow out of it in
 * a wave with their values riding up on top. A focus pass dims every column
 * but the named ones, lifts their values, and can send a band of light across
 * them. Shared by the quarter slide's inset and the nine-month chart.
 */
export function AnnABarChart({
  bars,
  colWidth,
  gap,
  barMax,
  step = 0,
  delay = 0,
  focus = [],
  focused = false,
  sheenStep,
  className,
}: AnnABarChartProps) {
  const on = useDeckStep() >= step;
  const peak = bars.reduce((high, bar) => Math.max(high, bar.value), 1);
  const trackW = bars.length * colWidth + (bars.length - 1) * gap;

  return (
    <div className={className} style={{ width: trackW }}>
      <div className="flex items-end" style={{ gap }}>
        {bars.map((bar, index) => {
          const lit = focused && focus.includes(index);
          return (
            <Column
              key={bar.label}
              bar={bar}
              colWidth={colWidth}
              height={Math.max(MIN_H, (bar.value / peak) * barMax)}
              index={index}
              lit={lit}
              dim={focused && !lit}
              on={on}
              step={step}
              delay={delay + 0.2 + index * STAGGER}
              sheenStep={sheenStep}
            />
          );
        })}
      </div>

      <m.div
        aria-hidden
        className="h-px origin-left bg-white/20"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: on ? 1 : 0 }}
        transition={cueTransition(on, delay, {
          duration: DUR.hero,
          ease: EASE.inOut,
        })}
      />

      <div className="mt-3 flex" style={{ gap }}>
        {bars.map((bar, index) => (
          <m.div
            key={bar.label}
            className="text-center text-xs text-white/45"
            style={{ width: colWidth }}
            initial={{ opacity: 0, y: -4 }}
            animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
            transition={cueTransition(on, delay + 0.3 + index * STAGGER, {
              duration: DUR.base,
              ease: EASE.out,
            })}
          >
            {bar.label}
          </m.div>
        ))}
      </div>
    </div>
  );
}
