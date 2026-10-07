"use client";

import { formatDurationMs } from "@eva/shared/duration";
import { useCountUpDisplay } from "@/lib/components/analytics/useCountUpDisplay";
import { formatCost, formatTokens, type LogTotals } from "../_utils";

interface LogsPeriodSummaryProps {
  title: string;
  totals: LogTotals;
}

/**
 * Screen Time-style hero: period caption, one spend number, one muted line.
 * Not a card — spend is a figure, not a control.
 */
export function LogsPeriodSummary({ title, totals }: LogsPeriodSummaryProps) {
  const spend = useCountUpDisplay(formatCost(totals.totalCost));
  const meta = [
    formatDurationMs(totals.totalDuration),
    `${formatTokens(totals.totalInput)} in`,
    `${formatTokens(totals.totalOutput)} out`,
  ];

  return (
    <section className="flex flex-col gap-1 px-4">
      <h3 className="text-balance text-sm font-semibold text-foreground">
        {title}
      </h3>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {spend}
      </p>
      <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
        {meta.join(" · ")}
      </p>
    </section>
  );
}
