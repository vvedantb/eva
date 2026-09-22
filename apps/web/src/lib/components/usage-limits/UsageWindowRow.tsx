"use client";

import { formatExactDateTime } from "@eva/shared/dates";
import { useCountUpDisplay } from "@/lib/components/analytics/useCountUpDisplay";
import {
  formatUtilization,
  resetsInLabel,
  toneForUtilization,
  USAGE_TONE_TEXT_CLASS,
  type UsageWindow,
} from "./_utils";
import { UsageBar } from "./UsageBar";

interface UsageWindowRowProps {
  usageWindow: UsageWindow;
  /** Passed in so every row in one card measures against the same instant. */
  now: number;
}

/** One plan window: its label, how full it is, and when it frees up again. */
export function UsageWindowRow({ usageWindow, now }: UsageWindowRowProps) {
  const utilization = usageWindow.utilization ?? 0;
  const tone = toneForUtilization(utilization);
  const resetsAt = usageWindow.resetsAt;
  const utilizationLabel = useCountUpDisplay(formatUtilization(utilization));

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate">{usageWindow.label}</span>
        <span className={`tabular-nums ${USAGE_TONE_TEXT_CLASS[tone]}`}>
          {utilizationLabel}
        </span>
      </div>
      <UsageBar utilization={utilization} tone={tone} />
      {resetsAt !== undefined && (
        <p
          className="text-[11px] text-muted-foreground"
          title={formatExactDateTime(resetsAt)}
        >
          {resetsInLabel(resetsAt, now)}
        </p>
      )}
    </div>
  );
}
