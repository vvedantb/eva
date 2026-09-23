import type { Icon } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { BRAND } from "../../_components/DeckPrimitives";

/** Seconds between neighbouring chips when a row or column lights up. */
export const FRI2_CHIP_STAGGER = 0.09;

interface Fri2ChipProps {
  icon: Icon;
  label: string;
  /** Lit chips carry the brand wash; unlit ones sit back in the surface. */
  lit: boolean;
  /** Position in the run, which sets the chip's share of the stagger. */
  index?: number;
  className?: string;
}

/**
 * One labelled routine. Lighting a column of these in order is the Friday
 * deck's way of saying "and then this one, and then this one" without a
 * sentence on the slide.
 */
export function Fri2Chip({
  icon: ChipIcon,
  label,
  lit,
  index = 0,
  className,
}: Fri2ChipProps) {
  const delay = lit ? index * FRI2_CHIP_STAGGER : 0;

  return (
    <m.div
      className={cn(
        "relative flex h-11 items-center gap-3 overflow-hidden rounded-full px-4",
        className,
      )}
      animate={{
        backgroundColor: lit
          ? "rgba(255,255,255,0.09)"
          : "rgba(255,255,255,0.04)",
        x: lit ? 0 : -10,
        opacity: lit ? 1 : 0.45,
      }}
      transition={{ type: "spring", bounce: 0, duration: 0.55, delay }}
    >
      <m.span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] origin-bottom rounded-full"
        style={{
          background: `linear-gradient(180deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        animate={{ scaleY: lit ? 1 : 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.5, delay }}
      />
      <ChipIcon
        size={18}
        stroke={1.6}
        aria-hidden
        className={lit ? "text-white/85" : "text-white/40"}
      />
      <span className="text-sm whitespace-nowrap text-white/85">{label}</span>
    </m.div>
  );
}
