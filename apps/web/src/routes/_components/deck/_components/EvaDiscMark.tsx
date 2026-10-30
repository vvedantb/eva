import { cn } from "@eva/ui";
import {
  EVA_DISC_STAR_BOTTOM_POINTS,
  EVA_DISC_STAR_SCALE,
  EVA_DISC_STAR_TOP_POINTS,
  EVA_MARK_BLUE,
  EVA_MARK_PURPLE,
} from "@/lib/utils/evaMark";

/**
 * Eva's current icon, as the favicon draws it: a white disc with the thicker
 * two-tone star enlarged to fill it. Geometry comes from `evaMark.ts`, so the
 * decks change when the icon does. The disc is always white, like the
 * favicon, so it reads on dark and light stages alike.
 */
export function EvaDiscMark({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-full shadow-[0_6px_24px_-8px_rgba(59,125,216,0.45)] ring-1 ring-black/5",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 512 512"
        className="size-full"
        role="img"
        aria-label="Eva"
      >
        <circle cx="256" cy="256" r="256" fill="#ffffff" />
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
