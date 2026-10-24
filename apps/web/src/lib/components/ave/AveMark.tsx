import { useId } from "react";
import { cn } from "@eva/ui";
import type { AveLogoState } from "@/lib/components/ave/aveLogoState";
import {
  EVA_DISC_STAR_BOTTOM_POINTS,
  EVA_DISC_STAR_SCALE,
  EVA_DISC_STAR_TOP_POINTS,
  EVA_MARK_BLUE,
  EVA_MARK_PURPLE,
} from "@/lib/utils/evaMark";

/**
 * Manager Ave's mark: Eva's two-tone disc star (shared with the favicon),
 * enlarged and clipped so it fills the circle instead of reading as a tiny glyph. The product
 * icon is Eva herself — this is that icon at a density that works as a launcher,
 * not a 22px glyph sitting in a chrome button.
 *
 * `state` is the launcher's: it draws that state's effects inside the disc
 * (thinking shimmer, searching sweep, error ring). Without it the mark is static.
 */
export function AveMark({
  size,
  className,
  state,
}: {
  size?: number;
  className?: string;
  state?: AveLogoState;
}) {
  const id = useId();
  const starClipId = `${id}-star`;
  const bandId = `${id}-band`;
  return (
    <span
      className={cn("inline-flex overflow-hidden rounded-full", className)}
      style={size === undefined ? undefined : { width: size, height: size }}
    >
      <svg viewBox="0 0 512 512" className="size-full" aria-hidden>
        <circle cx="256" cy="256" r="256" className="fill-card" />
        <g className="ave-star">
          <g
            transform={`translate(256 256) scale(${EVA_DISC_STAR_SCALE}) translate(-256 -256)`}
          >
            <polygon points={EVA_DISC_STAR_TOP_POINTS} fill={EVA_MARK_PURPLE} />
            <polygon
              points={EVA_DISC_STAR_BOTTOM_POINTS}
              fill={EVA_MARK_BLUE}
            />
            {state === "thinking" && (
              <g clipPath={`url(#${starClipId})`}>
                <defs>
                  <clipPath id={starClipId}>
                    <polygon points={EVA_DISC_STAR_TOP_POINTS} />
                    <polygon points={EVA_DISC_STAR_BOTTOM_POINTS} />
                  </clipPath>
                  <BandGradient id={bandId} peakOpacity={0.45} />
                </defs>
                <g transform="skewX(-20)">
                  <rect
                    className="ave-shimmer"
                    x="-200"
                    y="0"
                    width="160"
                    height="512"
                    fill={`url(#${bandId})`}
                  />
                </g>
              </g>
            )}
          </g>
        </g>
        {state === "searching" && (
          <>
            <defs>
              <BandGradient id={bandId} peakOpacity={0.22} />
            </defs>
            <rect
              className="ave-scan"
              x="0"
              y="0"
              width="180"
              height="512"
              fill={`url(#${bandId})`}
            />
          </>
        )}
        {state === "error" && (
          <circle
            className="ave-alarm"
            cx="256"
            cy="256"
            r="244"
            fill="none"
            strokeWidth="24"
          />
        )}
      </svg>
    </span>
  );
}

/** A soft white band, clear at both edges, for the shimmer and the sweep. */
function BandGradient({
  id,
  peakOpacity,
}: {
  id: string;
  peakOpacity: number;
}) {
  return (
    <linearGradient id={id}>
      <stop offset="0" stopColor="#fff" stopOpacity="0" />
      <stop offset="0.5" stopColor="#fff" stopOpacity={peakOpacity} />
      <stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
  );
}
