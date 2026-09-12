"use client";

import { useEffect, useState } from "react";
import { cn } from "@eva/ui";

const SEGMENTS = 32;

/**
 * Segmented tick-meter. Empty ticks stay mounted; a clipped fill row sweeps
 * left-to-right on `--motion-base`. `clip-path` (not `width`) keeps the tick
 * geometry unscaled — the same compositor rule as `UsageBar`'s `scaleX`.
 */
export function ScoreBar({
  value,
  max,
  tone = "default",
}: {
  value: number;
  max: number;
  tone?: "default" | "top" | "risk";
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const [shownRatio, setShownRatio] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShownRatio(ratio));
    return () => cancelAnimationFrame(id);
  }, [ratio]);

  const fillClass =
    tone === "top"
      ? "bg-warning"
      : tone === "risk"
        ? "bg-destructive"
        : "bg-foreground/65";

  return (
    <div className="relative flex w-full items-center gap-[2px]" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className="h-3.5 flex-1 rounded-full bg-muted-foreground/15"
        />
      ))}
      <div
        className="absolute inset-0 flex items-center gap-[2px] transition-[clip-path] duration-[var(--motion-base)]"
        style={{
          clipPath: `inset(0 ${((1 - shownRatio) * 100).toFixed(2)}% 0 0)`,
        }}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={cn("h-3.5 flex-1 rounded-full", fillClass)} />
        ))}
      </div>
    </div>
  );
}
