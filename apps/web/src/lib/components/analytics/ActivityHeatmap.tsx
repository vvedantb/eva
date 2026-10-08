"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ContributionGraph,
  ContributionGraphBlock,
  ContributionGraphCalendar,
  ContributionGraphFooter,
  ContributionGraphLegend,
} from "@eva/ui";
import type { Activity } from "@eva/ui";
import { IconFlame } from "@tabler/icons-react";
import { Widget } from "@/lib/components/Widget";
import { useCountUpDisplay } from "./useCountUpDisplay";

interface ActivityHeatmapProps {
  data: Array<{ date: string; count: number }>;
}

const MAX_LEVEL = 4;

function toActivities(data: Array<{ date: string; count: number }>): {
  activities: Activity[];
  totalCount: number;
} {
  let max = 0;
  let totalCount = 0;
  for (const entry of data) {
    if (entry.count > max) max = entry.count;
    totalCount += entry.count;
  }

  const safeMax = max || 1;
  const activities: Activity[] = data.map((entry) => ({
    date: entry.date,
    count: entry.count,
    level:
      entry.count === 0
        ? 0
        : Math.min(MAX_LEVEL, Math.ceil((entry.count / safeMax) * MAX_LEVEL)),
  }));

  return { activities, totalCount };
}

function computeStreak(data: Array<{ date: string; count: number }>): {
  currentStreak: number;
  longestStreak: number;
} {
  const countMap = new Map<string, number>();
  for (const entry of data) {
    countMap.set(entry.date, entry.count);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentStreak = 0;
  const cursor = new Date(today);
  while (true) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const count = countMap.get(dateStr) ?? 0;
    if (count === 0) break;
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  let longestStreak = 0;
  let streak = 0;
  const sorted = [...countMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  let prevDate: Date | undefined;
  for (const [dateStr, count] of sorted) {
    const d = new Date(dateStr + "T00:00:00");
    if (count > 0) {
      if (prevDate && d.getTime() - prevDate.getTime() === 86_400_000) {
        streak++;
      } else {
        streak = 1;
      }
      if (streak > longestStreak) longestStreak = streak;
    } else {
      streak = 0;
    }
    prevDate = d;
  }

  return { currentStreak, longestStreak };
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const { activities, totalCount } = toActivities(data);
  const { currentStreak, longestStreak } = computeStreak(data);
  const countedTotal = useCountUpDisplay(totalCount);

  return (
    <Widget
      title="Activity"
      subtitle="Tasks completed over the last year."
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {countedTotal}
        </p>
        <div className="flex items-center gap-4">
          {currentStreak > 0 && (
            <div className="flex items-center gap-1.5">
              <IconFlame size={18} className="text-warning" />
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {currentStreak} day streak
              </p>
            </div>
          )}
          {longestStreak > currentStreak && (
            <p className="text-xs text-muted-foreground">
              Longest:{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {longestStreak}d
              </span>
            </p>
          )}
        </div>
      </div>

      <TooltipProvider delayDuration={0}>
        <ContributionGraph
          data={activities}
          totalCount={totalCount}
          className="w-full max-w-full"
        >
          <ContributionGraphCalendar className="w-full">
            {({ activity, dayIndex, weekIndex }) => (
              <Tooltip>
                <TooltipTrigger asChild>
                  <g>
                    <ContributionGraphBlock
                      activity={activity}
                      dayIndex={dayIndex}
                      weekIndex={weekIndex}
                      className="t-heatmap-cell cursor-pointer"
                      style={{
                        animationDelay: `${Math.min(weekIndex * 20, 200)}ms`,
                      }}
                    />
                  </g>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <span className="font-medium">
                    {activity.count} {activity.count === 1 ? "task" : "tasks"}
                  </span>{" "}
                  on {formatDate(activity.date)}
                </TooltipContent>
              </Tooltip>
            )}
          </ContributionGraphCalendar>
          <ContributionGraphFooter>
            <ContributionGraphLegend />
          </ContributionGraphFooter>
        </ContributionGraph>
      </TooltipProvider>
    </Widget>
  );
}
