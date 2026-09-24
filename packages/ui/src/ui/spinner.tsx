import { cn } from "../utils/cn";
import { bindRuntimeAnimation } from "../utils/runtimeVisibility";

// Eva logo colours (matches public/icon.svg). The spinner is brand-only —
// no currentColor — so it reads the same on every surface and theme.
const PURPLE = "#8B3FB8";
const BLUE = "#3B7DD8";

const sizeClasses = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
};

/**
 * Rotates the arc around the viewBox centre, forever. Web Animations rather
 * than a CSS class: WAAPI gives {@link bindRuntimeAnimation} a handle to pause
 * the loop while the tab is hidden or the spinner is off screen, which a CSS
 * `animate-spin` cannot offer — it would keep ticking behind a hidden tab.
 * Module-level so the ref identity is stable across renders; React 19 runs the
 * returned cleanup on detach.
 */
function spinArc(arc: SVGGElement): () => void {
  const spin = arc.animate(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: 900, iterations: Infinity, easing: "linear" },
  );
  return bindRuntimeAnimation(arc, spin);
}

/**
 * Loading indicator: a plain circular spinner — a faint full ring with a
 * two-tone brand arc sweeping around it.
 *
 * The arc is two circles rather than one gradient stroke: a gradient only
 * samples the slice of its box the arc crosses, so at 12–16px the purple end
 * washed out to near-blue. Drawing blue over the leading half of a longer
 * purple dash keeps both logo colours legible at every size, and needs no
 * per-instance gradient id.
 */
function Spinner({
  size = "md",
  className,
  ...props
}: React.ComponentProps<"svg"> & {
  size?: "sm" | "md" | "lg";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="status"
      aria-label="Loading"
      className={cn(sizeClasses[size], className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke={PURPLE}
        strokeWidth={3}
        opacity={0.2}
      />
      <g
        ref={spinArc}
        style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={PURPLE}
          strokeWidth={3}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.36 0.64"
        />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={BLUE}
          strokeWidth={3}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.18 0.82"
        />
      </g>
    </svg>
  );
}

export { Spinner };
