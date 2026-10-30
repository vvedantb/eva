import { animate, m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";

export interface AnnAShrinkRow {
  label: string;
  /** Kilobytes before and after. */
  from: number;
  to: number;
  /** The fall, as a whole percentage. */
  drop: number;
}

const FORMAT = new Intl.NumberFormat("en-GB").format;
const RUN = 1.4;
/** Static glow, painted once; only its position and opacity move. */
const HEAD_GLOW = `radial-gradient(circle, #fff 0 3px, ${BRAND.blue}bb 5px, ${BRAND.purple}33 10px, transparent 16px)`;

/**
 * Counts a figure downwards once the build reaches the shrink step. Written
 * straight to the DOM node, so the fall does not re-render the slide.
 */
function CountDown({
  from,
  to,
  active,
  delay,
}: {
  from: number;
  to: number;
  active: boolean;
  delay: number;
}) {
  return (
    <span
      key={active ? "on" : "off"}
      className="tabular-nums"
      ref={(el) => {
        if (!el || !active) return;
        const controls = animate(from, to, {
          duration: RUN,
          delay,
          ease: EASE.expo,
          onUpdate: (value) => {
            el.textContent = FORMAT(Math.round(value));
          },
        });
        return () => controls.stop();
      }}
    >
      {FORMAT(from)}
    </span>
  );
}

/** The chip counts its fall up from zero as the bar collapses. */
function Drop({
  drop,
  on,
  delay,
}: {
  drop: number;
  on: boolean;
  delay: number;
}) {
  return (
    <m.span
      className="inline-block origin-left"
      initial={{ opacity: 0, scale: 0.85, x: -8 }}
      animate={
        on ? { opacity: 1, scale: 1, x: 0 } : { opacity: 0, scale: 0.85, x: -8 }
      }
      transition={cueTransition(on, delay, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      <Sheen step={1} delay={delay + RUN * 0.7} className="rounded-full">
        <span className="block rounded-full bg-white/[0.07] px-4 py-1.5 text-lg tabular-nums text-white/85">
          <CountUp
            value={drop}
            step={1}
            delay={delay}
            duration={RUN}
            prefix={"\u2212"}
            suffix="%"
          />
        </span>
      </Sheen>
    </m.span>
  );
}

function Row({
  row,
  active,
  delay,
  enter,
}: {
  row: AnnAShrinkRow;
  active: boolean;
  /** Seconds into the shrink step. */
  delay: number;
  /** Seconds into the slide for the entrance. */
  enter: number;
}) {
  const ratio = row.to / row.from;
  const shrink = active
    ? { duration: RUN, ease: EASE.expo, delay }
    : { duration: DUR.slow, ease: EASE.out };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xl text-white/55">
          <MaskedText delay={enter} stagger={0.05} duration={DUR.slow}>
            {row.label}
          </MaskedText>
        </span>
        <m.span
          className="flex items-baseline gap-5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: DUR.slow,
            ease: EASE.expo,
            delay: enter + 0.1,
          }}
        >
          <span className="text-5xl leading-none font-semibold tracking-[-0.02em] text-white">
            <CountDown
              from={row.from}
              to={row.to}
              active={active}
              delay={delay}
            />
            <span className="ml-2 text-2xl font-normal text-white/45">kB</span>
          </span>
          <Drop drop={row.drop} on={active} delay={delay + RUN * 0.35} />
        </m.span>
      </div>

      <div className="relative mt-4 h-3 w-full">
        <div className="absolute inset-0 overflow-hidden rounded-full bg-white/[0.06]">
          {/* Draws in on entry, then collapses to the new size on the step. */}
          <m.div
            aria-hidden
            className="h-full origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.2, ease: EASE.expo, delay: enter + 0.15 }}
          >
            <m.div
              className="h-full origin-left rounded-full"
              style={{ background: BRAND_GRADIENT }}
              initial={false}
              animate={{ scaleX: active ? ratio : 1 }}
              transition={shrink}
            />
          </m.div>
        </div>
        {/* A light rides the bar's end in as it collapses. */}
        <m.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{ x: active ? `${ratio * 100}%` : "100%" }}
          transition={shrink}
        >
          <m.span
            className="absolute top-1/2 left-0 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: HEAD_GLOW }}
            initial={{ opacity: 0 }}
            animate={active ? { opacity: [0, 1, 1, 0.55] } : { opacity: 0 }}
            transition={
              active
                ? { duration: RUN + 0.2, times: [0, 0.1, 0.7, 1], delay }
                : { duration: DUR.fast }
            }
          />
        </m.div>
      </div>
    </div>
  );
}

/**
 * Two full-width bars draw in at their old size. On the step they collapse to
 * the new one, a light riding each end in, while the figure counts down and
 * the fall counts up in its chip. The shrink is the argument, so nothing else
 * moves.
 */
export function AnnAShrinkBars({
  rows,
  active,
  className,
}: {
  rows: readonly AnnAShrinkRow[];
  active: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="space-y-12">
        {rows.map((row, index) => (
          <Row
            key={row.label}
            row={row}
            active={active}
            delay={index * 0.22}
            enter={0.35 + index * 0.14}
          />
        ))}
      </div>
    </div>
  );
}
