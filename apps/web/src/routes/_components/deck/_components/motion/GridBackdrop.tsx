import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckTheme } from "../deckContext";

export interface GridBackdropProps {
  /** `grid`: a floor of lines receding in perspective. `dots`: a flat drifting dot field. */
  variant?: "grid" | "dots";
  /** Cell size in pixels. */
  cell?: number;
  /** Seconds for the pattern to drift one cell. Larger is calmer. */
  period?: number;
  className?: string;
}

const INK = { dark: "rgba(255,255,255,0.07)", light: "rgba(9,9,11,0.07)" };

/**
 * A faint moving floor for data slides. The pattern is a static background on
 * an oversized layer; the drift is that layer translating by exactly one cell
 * on a linear loop, so the seam never shows and nothing repaints. Place it
 * first inside a `relative isolate` parent; it sits behind everything.
 *
 * @example <GridBackdrop variant="grid" className="top-1/3" />
 */
export function GridBackdrop({
  variant = "grid",
  cell = 56,
  period = 6,
  className,
}: GridBackdropProps) {
  const ink = INK[useDeckTheme()];
  const grid = variant === "grid";
  const pattern = grid
    ? `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`
    : `radial-gradient(${ink} 1.2px, transparent 1.2px)`;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
      style={{
        perspective: grid ? 520 : undefined,
        maskImage: grid
          ? "linear-gradient(to bottom, transparent, black 35%, black 70%, transparent)"
          : "radial-gradient(ellipse at center, black 20%, transparent 75%)",
      }}
    >
      <div
        className="absolute -inset-x-1/2 -top-full -bottom-1/2"
        style={{
          transform: grid ? "rotateX(62deg)" : undefined,
          transformOrigin: "50% 100%",
        }}
      >
        <m.div
          className="absolute inset-x-0"
          style={{
            top: -cell,
            bottom: -cell,
            backgroundImage: pattern,
            backgroundSize: `${cell}px ${cell}px`,
          }}
          animate={{ y: [0, cell] }}
          transition={{ duration: period, ease: "linear", repeat: Infinity }}
        />
      </div>
    </div>
  );
}
