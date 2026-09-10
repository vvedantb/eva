import { cn } from "../utils/cn";

// Eva logo geometry (matches public/icon.svg).
const PURPLE = "0,256 217,237 256,64 295,237 512,256";
const BLUE = "0,256 217,275 256,449 295,275 512,256";

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
  return () => trace.cancel();
}

/**
 * Loading indicator: the Eva mark drawn as an outline with a dash that
 * continuously traces each half's perimeter (see `traceDash`).
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
        points={PURPLE}
        fill="none"
        stroke="#8B3FB8"
        strokeWidth={40}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.28 0.72"
      />
      <polygon
        ref={traceDash}
        points={BLUE}
        fill="none"
        stroke="#3B7DD8"
        strokeWidth={40}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.28 0.72"
      />
    </svg>
  );
}

export { Spinner };
