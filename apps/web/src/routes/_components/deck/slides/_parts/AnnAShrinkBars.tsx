import { animate, m } from "motion/react";
import { BRAND, EASE_OUT } from "../../_components/DeckPrimitives";

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
          ease: EASE_OUT,
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

function Row({
  row,
  active,
  delay,
}: {
  row: AnnAShrinkRow;
  active: boolean;
  delay: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xl text-white/55">{row.label}</span>
        <span className="flex items-baseline gap-5">
          <span className="text-5xl leading-none font-semibold tracking-[-0.02em] text-white">
            <CountDown
              from={row.from}
              to={row.to}
              active={active}
              delay={delay}
            />
            <span className="ml-2 text-2xl font-normal text-white/45">kB</span>
          </span>
          <m.span
            className="rounded-full bg-white/[0.07] px-4 py-1.5 text-lg tabular-nums text-white/85"
            initial={{ opacity: 0, y: 10 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={
              active
                ? {
                    type: "spring",
                    bounce: 0,
                    duration: 0.5,
                    delay: delay + RUN * 0.6,
                  }
                : { duration: 0.2, ease: EASE_OUT }
            }
          >
            &minus;{row.drop}%
          </m.span>
        </span>
      </div>

      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <m.div
          aria-hidden
          className="h-full origin-left rounded-full"
          style={{
            background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: active ? row.to / row.from : 1 }}
          transition={{
            duration: active ? RUN : 0.35,
            ease: EASE_OUT,
            delay: active ? delay : 0,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Two full-width bars that collapse to their new size while the figure beside
 * them counts down. The shrink is the argument, so nothing else moves.
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
          <Row key={row.label} row={row} active={active} delay={index * 0.22} />
        ))}
      </div>
    </div>
  );
}
