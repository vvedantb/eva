import { cn } from "@eva/ui";
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
 */
export function AveMark({
  size,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex overflow-hidden rounded-full", className)}
      style={
        size === undefined ? undefined : { width: size, height: size }
      }
    >
      <svg
        viewBox="0 0 512 512"
        className="size-full"
        aria-hidden
      >
        <circle cx="256" cy="256" r="256" className="fill-card" />
        <g
          transform={`translate(256 256) scale(${EVA_DISC_STAR_SCALE}) translate(-256 -256)`}
        >
          <polygon points={EVA_DISC_STAR_TOP_POINTS} fill={EVA_MARK_PURPLE} />
          <polygon points={EVA_DISC_STAR_BOTTOM_POINTS} fill={EVA_MARK_BLUE} />
        </g>
      </svg>
    </span>
  );
}
