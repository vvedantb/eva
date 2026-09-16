import type { ReactNode } from "react";
import { animate, m } from "motion/react";
import { BRAND, EASE_OUT } from "../../_components/DeckPrimitives";

interface RaceLaneProps {
  label: string;
  /** false leaves the lane empty, waiting for the presenter. */
  running: boolean;
  /** Seconds the fill takes to cross the track. */
  duration: number;
  /** Brand gradient for the fast lane, plain white for the slow one. */
  brand?: boolean;
  readout: ReactNode;
  caption?: ReactNode;
}

export function RaceLane({
  label,
  running,
  duration,
  brand = false,
  readout,
  caption,
}: RaceLaneProps) {
  return (
    <div className="relative flex h-[90px] items-center">
      {brand && (
        <m.div
          aria-hidden
          className="pointer-events-none absolute -inset-x-4 inset-y-1 rounded-2xl blur-xl"
          style={{
            background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ opacity: 0 }}
          animate={running ? { opacity: [0, 0.35, 0] } : { opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
        />
      )}

      <div className="relative w-[200px] shrink-0 text-sm text-white/60">
        {label}
      </div>

      <div className="relative flex-1">
        <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
          <m.div
            className="h-full w-full origin-left rounded-full"
            style={
              brand
                ? {
                    background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
                  }
                : { background: "rgba(255,255,255,0.25)" }
            }
            initial={{ scaleX: 0 }}
            animate={{ scaleX: running ? 1 : 0 }}
            transition={{
              duration: running ? duration : 0.2,
              ease: brand ? EASE_OUT : "linear",
            }}
          />
        </div>
        {caption && (
          <div className="absolute top-6 left-0 text-xs text-white/45">
            {caption}
          </div>
        )}
      </div>

      <div className="relative flex w-[160px] shrink-0 items-center justify-end gap-2">
        {readout}
      </div>
    </div>
  );
}

interface LinearCountProps {
  /** Counted in tenths, so 400 reads as 40.0. */
  tenths: number;
  duration: number;
  running: boolean;
  className?: string;
}

/**
 * A linear counter. `CountUp` is fixed to EASE_OUT, and a race readout has to
 * move at the same steady pace as the bar beside it.
 */
export function LinearCount({
  tenths,
  duration,
  running,
  className,
}: LinearCountProps) {
  const text = (n: number) => `${(n / 10).toFixed(1)} s`;

  return (
    <span
      key={running ? "on" : "off"}
      className={className}
      ref={(el) => {
        if (!el || !running) return;
        const controls = animate(0, tenths, {
          duration,
          ease: "linear",
          onUpdate: (v) => {
            el.textContent = text(Math.round(v));
          },
        });
        return () => controls.stop();
      }}
    >
      {running ? text(0) : ""}
    </span>
  );
}
