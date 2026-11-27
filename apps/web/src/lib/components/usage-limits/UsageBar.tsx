import { cn } from "@eva/ui";
import { type UsageTone } from "@eva/shared/usageLimits";
import { USAGE_TONE_FILL_CLASS } from "./toneClasses";

interface UsageBarProps {
  /** Percentage of the window consumed, 0-100. */
  utilization: number;
  tone: UsageTone;
  className?: string;
}

/**
 * Slim tone-based meter. The fill is always mounted at full size and scaled
 * from its left edge rather than sized by `width`, so a changing value moves on
 * the compositor instead of relayouting the row it sits in.
 */
export function UsageBar({ utilization, tone, className }: UsageBarProps) {
  const ratio = Math.min(Math.max(utilization, 0), 100) / 100;

  return (
    <div
      aria-hidden
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 origin-left transition-transform duration-[var(--motion-base)]",
          USAGE_TONE_FILL_CLASS[tone],
        )}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
