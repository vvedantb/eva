"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { CenteredSpinner } from "@eva/ui";
import { IconChartBarOff } from "@tabler/icons-react";
import {
  DAY_MS,
  HOUR_MS,
  getStartTime,
  type TimeRange,
} from "@/lib/components/analytics/timeRange";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { bucketStartsBetween } from "../_utils";
import { UsageOverview } from "./UsageOverview";
import { UsageByModelChart } from "./UsageByModelChart";
import { UsageModelTable } from "./UsageModelTable";

interface UsageOverviewViewProps {
  repoId: Id<"githubRepos">;
  range: TimeRange;
  /** Quantised "now" from the client: the window end and the bucket the clock sits in. */
  now: number;
  title: string;
}

/**
 * The Overview tab: totals, spend-over-time chart and per-model table from one
 * `usage.summary` subscription. "All time" has no fixed bucket count, so it
 * shows totals and the table but no chart.
 */
export function UsageOverviewView({
  repoId,
  range,
  now,
  title,
}: UsageOverviewViewProps) {
  const bucket = range === "24h" ? "hour" : "day";
  const bucketMs = bucket === "hour" ? HOUR_MS : DAY_MS;
  const startTime = getStartTime(range, now) ?? 0;
  // `now` is floored to the bucket, so the window must reach past it to include
  // the bucket in progress.
  const endTime = now + bucketMs;
  const tzOffsetMinutes = new Date().getTimezoneOffset();

  const summary = useQuery(api.usage.summary, {
    repoId,
    startTime,
    endTime,
    bucket,
    tzOffsetMinutes,
  });

  if (summary === undefined) {
    return (
      <section className="flex flex-col gap-3 px-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <CenteredSpinner label="Loading usage" />
      </section>
    );
  }

  if (summary.totals.completions === 0) {
    return (
      <SettingsSection title={title} bodyVariant="list">
        <SettingsEmptyState
          icon={IconChartBarOff}
          title="No usage in this range"
          description="Nothing ran in this range. Widen it to see spend."
        />
      </SettingsSection>
    );
  }

  const starts =
    range === "all"
      ? []
      : bucketStartsBetween(
          startTime,
          endTime,
          bucketMs,
          tzOffsetMinutes * 60_000,
        );

  return (
    <>
      <UsageOverview
        title={title}
        totals={summary.totals}
        truncated={summary.truncated}
      />
      {starts.length > 0 ? (
        <UsageByModelChart
          buckets={summary.buckets}
          starts={starts}
          bucket={bucket}
        />
      ) : null}
      <UsageModelTable
        rows={summary.byModel}
        totalCostUsd={summary.totals.costUsd}
      />
    </>
  );
}
