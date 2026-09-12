import { useQueryState } from "nuqs";
import { timeRangeParser } from "@/lib/search-params";
import { api } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Skeleton, motionBase } from "@eva/ui";
import { m } from "motion/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { Kpi, KpiGroup } from "@/lib/components/analytics/Kpi";
import { PRsOverTimeChart } from "@/lib/components/analytics/PRsOverTimeChart";
import { SessionFunnel } from "@/lib/components/analytics/SessionFunnel";
import { ActivityTimelineChart } from "@/lib/components/analytics/ActivityTimelineChart";
import { Leaderboard } from "@/lib/components/analytics/Leaderboard";
import { ActivityHeatmap } from "@/lib/components/analytics/ActivityHeatmap";
import { TimeRangeFilter } from "@/lib/components/analytics/TimeRangeFilter";
import {
  getStartTime,
  getPreviousStartTime,
  getBucketSize,
  DAY_MS,
} from "@/lib/components/analytics/timeRange";
import { useQuantizedNow } from "@/lib/hooks/useQuantizedNow";
import { formatDurationCompactMs } from "@eva/shared/duration";
import {
  IconGitPullRequest,
  IconPercentage,
  IconChecklist,
  IconGitMerge,
  IconClockBolt,
  IconTargetArrow,
  IconClockHour4,
} from "@tabler/icons-react";

/** Stats aggregates by day, so the hourly "24h" range is not offered here. */
const STATS_RANGES = ["7d", "30d", "90d", "all"] as const;

/** Hours we credit back to a human for each task the agent completed. */
const HOURS_SAVED_PER_TASK = 2;

export function StatsClient() {
  const { repo } = useRepo();
  const [timeRange, setTimeRange] = useQueryState("range", timeRangeParser);

  // Analytics windows are measured from this clock. Queries take the timestamp
  // as an argument because they cannot read it themselves — a Convex query is
  // cached against its data, so a clock read freezes at first compute time.
  const today = useQuantizedNow(DAY_MS);

  const startTime = getStartTime(timeRange, today);
  const bucketSize = getBucketSize(timeRange);
  const timelineStart = startTime ?? today - 90 * DAY_MS;

  const impactStats = useQuery(api.analytics.getImpactStats, {
    repoId: repo._id,
    startTime,
    previousStartTime: getPreviousStartTime(timeRange, today),
  });
  const timeline = useQuery(api.analytics.getActivityTimeline, {
    repoId: repo._id,
    startTime: timelineStart,
    endTime: today,
    bucketSizeMs: bucketSize,
  });
  const leaderboard = useQuery(api.analytics.getLeaderboard, {
    repoId: repo._id,
    startTime,
  });
  const heatmap = useQuery(api.analytics.getActivityHeatmap, {
    repoId: repo._id,
    startTime: today - 365 * DAY_MS,
  });

  const isLoading =
    impactStats === undefined ||
    timeline === undefined ||
    leaderboard === undefined ||
    heatmap === undefined;

  return (
    <PageWrapper
      title="Stats"
      comfortable
      insetHeader
      headerRight={
        <TimeRangeFilter
          value={timeRange}
          onChange={setTimeRange}
          ranges={STATS_RANGES}
        />
      }
    >
      {isLoading ? (
        <div
          className="min-h-144 space-y-8"
          aria-busy="true"
          aria-label="Loading stats"
        >
          <Skeleton className="h-40 border border-border" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 border border-border" />
            ))}
          </div>
          <Skeleton className="h-28 border border-border" />
          <Skeleton className="h-56 border border-border" />
        </div>
      ) : (
        <div className="space-y-8">
          <ActivityHeatmap data={heatmap} />

          <KpiGroup className="lg:grid-cols-3">
            <Kpi
              icon={IconGitPullRequest}
              label="PRs Shipped"
              value={impactStats.prsShipped}
              currentValue={impactStats.prsShipped}
              previousValue={
                "prevPrsShipped" in impactStats
                  ? impactStats.prevPrsShipped
                  : undefined
              }
            />
            <Kpi
              icon={IconPercentage}
              label="Cook Rate"
              value={`${impactStats.shipRate}%`}
              subtitle={`${impactStats.tasksCompleted} of ${impactStats.tasksRan} settled tasks`}
              currentValue={impactStats.shipRate}
              previousValue={
                "prevShipRate" in impactStats
                  ? impactStats.prevShipRate
                  : undefined
              }
            />
            <Kpi
              icon={IconChecklist}
              label="Tasks Completed"
              value={impactStats.tasksCompleted}
              currentValue={impactStats.tasksCompleted}
              previousValue={
                "prevTasksCompleted" in impactStats
                  ? impactStats.prevTasksCompleted
                  : undefined
              }
            />
          </KpiGroup>

          <KpiGroup className="lg:grid-cols-3">
            <Kpi
              icon={IconGitMerge}
              label="PRs Merged"
              value={impactStats.prsMerged}
              subtitle={`${impactStats.mergeRate}% of session PRs merged`}
              currentValue={impactStats.prsMerged}
              previousValue={
                "prevPrsMerged" in impactStats
                  ? impactStats.prevPrsMerged
                  : undefined
              }
            />
            <Kpi
              icon={IconClockBolt}
              label="Median Time to PR"
              value={
                impactStats.medianTimeToPrMs === undefined
                  ? "—"
                  : formatDurationCompactMs(impactStats.medianTimeToPrMs)
              }
              subtitle="task created to PR opened"
            />
            <Kpi
              icon={IconTargetArrow}
              label="First-Try Rate"
              value={`${impactStats.firstTryRate}%`}
              subtitle="tasks done in one run"
              currentValue={impactStats.firstTryRate}
              previousValue={
                "prevFirstTryRate" in impactStats
                  ? impactStats.prevFirstTryRate
                  : undefined
              }
            />
          </KpiGroup>

          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionBase}
          >
            <Kpi
              icon={IconClockHour4}
              label="Estimated Hours Saved"
              value={`${impactStats.tasksCompleted * HOURS_SAVED_PER_TASK}h`}
              subtitle={`est. ${HOURS_SAVED_PER_TASK}h saved per completed task · agent worked ${formatDurationCompactMs(impactStats.agentWorkMs)}`}
              size="lg"
            />
          </m.div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PRsOverTimeChart timeline={timeline} />
            </div>
            <SessionFunnel
              totalSessions={impactStats.totalSessions}
              sessionsWithPr={impactStats.sessionsWithPr}
            />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ActivityTimelineChart timeline={timeline} />
            </div>
            <Leaderboard entries={leaderboard} />
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
