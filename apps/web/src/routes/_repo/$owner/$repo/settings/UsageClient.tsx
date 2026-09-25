"use client";

import { useQueryState } from "nuqs";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { CenteredSpinner, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  timeRangeParser,
  searchParser,
  logViewParser,
} from "@/lib/search-params";
import {
  getStartTime,
  DAY_MS,
  HOUR_MS,
  TIME_RANGE_LABELS,
} from "@/lib/components/analytics/timeRange";
import { TimeRangeFilter } from "@/lib/components/analytics/TimeRangeFilter";
import { useQuantizedNow } from "@/lib/hooks/useQuantizedNow";
import { IconFileOff } from "@tabler/icons-react";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { ToggleSearch } from "@/lib/components/ui/ToggleSearch";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { groupLogsByType, logTotals, parseResultEvent } from "./logs/_utils";
import { LogsPeriodSummary } from "./logs/_components/LogsPeriodSummary";
import { LogsViewTabs } from "./logs/_components/LogsViewTabs";
import { LogEntryGroup } from "./logs/_components/LogEntryGroup";
import { ProjectSpendingGroup } from "./logs/_components/ProjectSpendingGroup";
import { UsageOverviewView } from "./logs/_components/UsageOverviewView";

/**
 * Settings → Usage. The Overview tab aggregates the denormalised usage columns
 * server-side (`usage.summary`); the Type and Project tabs are the completion
 * ledger, whose totals must match the overview for the same range.
 */
export function UsageClient() {
  const { repo } = useRepo();
  const [timeRange, setTimeRange] = useQueryState("range", timeRangeParser);
  const [searchQuery, setSearchQuery] = useQueryState("q", searchParser);
  const [logView, setLogView] = useQueryState("view", logViewParser);

  // Hourly for the 24h window so the current hour's bar fills in; daily otherwise.
  const now = useQuantizedNow(timeRange === "24h" ? HOUR_MS : DAY_MS);
  const startTime = getStartTime(timeRange, now);
  const query = (searchQuery ?? "").toLowerCase().trim();
  const periodTitle = TIME_RANGE_LABELS[timeRange];

  const isOverview = logView === "overview";
  const isProjectView = logView === "project";

  // The ledger tabs own these subscriptions; the overview has its own query.
  const logs = useQuery(
    api.logs.listByRepo,
    isOverview
      ? "skip"
      : { repoId: repo._id, startTime: startTime ?? undefined },
  );

  const projectLogs = useQuery(
    api.logs.listByProject,
    isProjectView
      ? { repoId: repo._id, startTime: startTime ?? undefined }
      : "skip",
  );

  const filteredLogs = logs
    ? logs.filter((log) =>
        query ? log.entityTitle.toLowerCase().includes(query) : true,
      )
    : undefined;

  const projectGroups = projectLogs
    ? projectLogs
        .flatMap((group) => {
          const filtered = query
            ? group.logs.filter(
                (log) =>
                  log.entityTitle.toLowerCase().includes(query) ||
                  group.projectTitle.toLowerCase().includes(query),
              )
            : group.logs;
          if (filtered.length === 0) return [];
          let totalCost = 0;
          for (const log of filtered) {
            totalCost += parseResultEvent(log.rawResultEvent).costUsd;
          }
          return [
            {
              projectId: group.projectId,
              projectTitle: group.projectTitle,
              logs: filtered,
              totalCost,
            },
          ];
        })
        .sort((a, b) => b.totalCost - a.totalCost)
    : undefined;

  const isLoading = isProjectView
    ? projectGroups === undefined
    : filteredLogs === undefined;
  const isEmpty = isProjectView
    ? projectGroups !== undefined && projectGroups.length === 0
    : filteredLogs !== undefined && filteredLogs.length === 0;

  const typeTotals = filteredLogs ? logTotals(filteredLogs) : undefined;
  const projectTotals = projectGroups
    ? logTotals(projectGroups.flatMap((group) => group.logs))
    : undefined;
  const grouped = filteredLogs ? groupLogsByType(filteredLogs) : [];
  const totals = isProjectView ? projectTotals : typeTotals;

  return (
    <SettingsPage
      title="Usage"
      headerRight={
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
      }
      toolbar={
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          <LogsViewTabs value={logView} onChange={setLogView} />
          <div className="ml-auto">
            {isOverview ? null : (
              <ToggleSearch
                value={searchQuery ?? ""}
                onChange={setSearchQuery}
                placeholder="Search"
              />
            )}
          </div>
        </div>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {isOverview ? (
          <m.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <UsageOverviewView
              repoId={repo._id}
              range={timeRange}
              now={now}
              title={periodTitle}
            />
          </m.div>
        ) : (
          <m.div
            key="ledger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            {isLoading ? (
              <CenteredSpinner label="Loading logs" />
            ) : isEmpty ? (
              <SettingsSection title={periodTitle} bodyVariant="list">
                <SettingsEmptyState
                  icon={IconFileOff}
                  title={
                    isProjectView
                      ? "No project spending"
                      : "No completions logged"
                  }
                  description={
                    isProjectView
                      ? "Nothing was billed to a project in this range."
                      : "Nothing ran in this range. Widen it or clear search."
                  }
                />
              </SettingsSection>
            ) : (
              <>
                {totals ? (
                  <LogsPeriodSummary title={periodTitle} totals={totals} />
                ) : null}
                {isProjectView
                  ? projectGroups?.map((group, index) => (
                      <ListEnter key={group.projectId} index={index}>
                        <ProjectSpendingGroup
                          projectTitle={group.projectTitle}
                          logs={group.logs}
                          totalCost={group.totalCost}
                        />
                      </ListEnter>
                    ))
                  : grouped.map((group, index) => (
                      <ListEnter key={group.type} index={index}>
                        <LogEntryGroup
                          type={group.type}
                          logs={group.logs}
                          total={group.total}
                        />
                      </ListEnter>
                    ))}
              </>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </SettingsPage>
  );
}
