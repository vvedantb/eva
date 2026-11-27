import {
  EVA_MARK_BLUE,
  EVA_MARK_BOTTOM_POINTS,
  EVA_MARK_PURPLE,
  EVA_MARK_TOP_POINTS,
} from "@/lib/utils/evaMark";

interface EvaIconProps {
  size?: number;
  className?: string;
  /**
   * Pass `null` where a visible "Eva" wordmark sits beside the icon, so screen
   * readers do not announce the name twice.
   */
  label?: string | null;
  /**
   * Draw the backing disc. Off where the mark sits among line glyphs (the
   * rail), since at ~22px the disc reads as a pale blob and swallows the star.
   */
  disc?: boolean;
}

/**
 * Eva's mark, inline so the disc can track `--card` and sit flush with whatever
 * surface it lands on. Full-bleed — the badge gutter is a favicon-only concern
 * (see `evaMark.ts`).
 */
export function EvaIcon({
  size = 20,
  className,
  label = "Eva",
  disc = true,
}: EvaIconProps) {
  const a11y =
    label === null
      ? { "aria-hidden": true }
      : { role: "img", "aria-label": label };

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      {...a11y}
    >
      {disc ? (
        <circle cx="256" cy="256" r="256" className="fill-card" />
      ) : null}
      <polygon points={EVA_MARK_TOP_POINTS} fill={EVA_MARK_PURPLE} />
      <polygon points={EVA_MARK_BOTTOM_POINTS} fill={EVA_MARK_BLUE} />
    </svg>
  );
}
