import { cn } from "../utils/cn";
import { bindRuntimeAnimation } from "../utils/runtimeVisibility";

// Eva logo colours (matches public/icon.svg). Both spinners are brand-only —
// no currentColor — so they read the same on every surface and theme.
const PURPLE = "#8B3FB8";
const BLUE = "#3B7DD8";

// Eva logo geometry (matches public/icon.svg), used by the mark Spinner.
const PURPLE_MARK = "0,256 217,237 256,64 295,237 512,256";
const BLUE_MARK = "0,256 217,275 256,449 295,275 512,256";

const sizeClasses = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
};

/**
 * Runs the dash around one half: `stroke-dashoffset` 0 → -1 over 2s, forever,
 * against `pathLength=1`. Web Animations rather than SMIL `<animate>`: SMIL
 * ticks each polygon's animated attribute on its own, so every spinner forced
 * ~9 style recalcs per frame (traced 420/s for eight spinners); WAAPI folds
 * into the frame's single recalc (49/s) and cut main-thread time 37% with the
 * same keyframes, and the component stays self-contained — no app stylesheet
 * keyframes. Module-level so the ref identity is stable across renders; React
 * 19 runs the returned cleanup on detach.
 */
function traceDash(polygon: SVGPolygonElement): () => void {
  const trace = polygon.animate(
    [{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }],
    { duration: 2000, iterations: Infinity },
  );
  return bindRuntimeAnimation(polygon, trace);
}

/**
 * Default loading indicator: the Eva mark drawn as an outline with a dash that
 * continuously traces each half's perimeter (see `traceDash`). Use it for page
 * and panel loads, where the brand moment is worth the extra pixels.
 *
 * For small inline slots — a button, a menu row, the preview nav bar — reach
 * for {@link CircleSpinner} instead: the mark's detail collapses below ~20px.
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
      viewBox="0 0 512 512"
      role="status"
      aria-label="Loading"
      className={cn(sizeClasses[size], className)}
      {...props}
    >
      <polygon
        ref={traceDash}
        points={PURPLE_MARK}
        fill="none"
        stroke={PURPLE}
        strokeWidth={40}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.28 0.72"
      />
      <polygon
        ref={traceDash}
        points={BLUE_MARK}
        fill="none"
        stroke={BLUE}
        strokeWidth={40}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.28 0.72"
      />
    </svg>
  );
}

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
 * Plain circular spinner in the brand colours: a faint full ring with a
 * two-tone arc sweeping around it. For slots where {@link Spinner}'s mark is
 * too small to read — inline buttons, menu rows, the preview nav bar reload —
 * and anywhere a generic `animate-spin` loader icon used to sit.
 *
 * The arc is two circles rather than one gradient stroke: a gradient only
 * samples the slice of its box the arc crosses, so at 12–16px the purple end
 * washed out to near-blue. Drawing blue over the leading half of a longer
 * purple dash keeps both logo colours legible at every size, and needs no
 * per-instance gradient id.
 */
function CircleSpinner({
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

export { CircleSpinner, Spinner };
