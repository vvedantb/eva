"use client";

import { Suspense, use, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id } from "@eva/backend";
import dayjs from "@eva/shared/dates";
import {
  PROJECT_PROGRESS_DAYS,
  progressDayDetail,
  type ProgressTaskName,
} from "@eva/shared/projectProgress";
import { hrefToNavigateOptions, toInternalRepoHref } from "@/lib/utils/repoUrl";
import { useChartAnimation } from "@/lib/components/analytics/chartMotion";

/** Lazy chart.js, as the Stats charts: the Project page does not pay for it up front. */
const chartModules = Promise.all([
  import("react-chartjs-2"),
  import("chart.js"),
]).then(([reactChart, chartJs]) => {
  chartJs.Chart.register(
    chartJs.BarController,
    chartJs.LineController,
    chartJs.BarElement,
    chartJs.LineElement,
    chartJs.PointElement,
    chartJs.CategoryScale,
    chartJs.LinearScale,
    chartJs.Tooltip,
  );
  return { Chart: reactChart.Chart };
});

/** A theme token's colour, read when the chart draws (canvas cannot take `var()`). */
function token(name: string): string {
  if (typeof document === "undefined") return "transparent";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
}

/** The three series: one colour each, the same in the legend, bars and line. */
const SERIES = {
  shipped: { label: "Shipped", color: "success" },
  archived: { label: "Archived", color: "muted-foreground" },
  open: { label: "Open", color: "cat-2" },
} as const;

type ChartDay = { start: number; shipped: number; archived: number; open: number };

function ProgressCanvas({
  days,
  selected,
  onSelect,
}: {
  days: ChartDay[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const { Chart } = use(chartModules);
  const animation = useChartAnimation();
  const shipped = token(SERIES.shipped.color);
  const archived = token(SERIES.archived.color);
  const open = token(SERIES.open.color);
  const grid = token("border");
  const ink = token("muted-foreground");
  // The picked day stays full colour; the rest dim, so the list below reads as its own.
  const dimmed = (color: string, index: number) =>
    selected === null || selected === index
      ? color
      : `color-mix(in oklab, ${color} 35%, transparent)`;
  return (
    <Chart
      type="bar"
      data={{
        labels: days.map((day) => dayjs(day.start).format("D MMM")),
        datasets: [
          {
            type: "bar",
            label: SERIES.shipped.label,
            data: days.map((day) => day.shipped),
            backgroundColor: days.map((_, i) => dimmed(shipped, i)),
            borderRadius: 4,
            borderSkipped: "start",
            stack: "closed",
            maxBarThickness: 14,
          },
          {
            type: "bar",
            label: SERIES.archived.label,
            data: days.map((day) => day.archived),
            backgroundColor: days.map((_, i) => dimmed(archived, i)),
            borderRadius: 4,
            borderSkipped: "start",
            stack: "closed",
            maxBarThickness: 14,
          },
          {
            type: "line",
            label: SERIES.open.label,
            data: days.map((day) => day.open),
            borderColor: open,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: open,
            tension: 0.3,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        animation,
        interaction: { mode: "index", intersect: false },
        onClick: (_event, elements, chart) => {
          const hit = elements[0]?.index ?? chart.tooltip?.dataPoints?.[0]?.dataIndex;
          if (hit !== undefined) onSelect(hit);
        },
        plugins: {
          legend: { display: false },
          tooltip: { mode: "index", intersect: false },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { color: grid },
            ticks: { color: ink, maxTicksLimit: 6, maxRotation: 0 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: grid },
            border: { display: false },
            ticks: { color: ink, precision: 0, maxTicksLimit: 4 },
          },
        },
      }}
    />
  );
}

/**
 * The Project page's 30-day progress chart (`projects.progressChart`), like
 * Amp Spaces: per day, tasks shipped (PR merged or Done) and archived
 * without shipping as stacked bars, and the tasks open at the day's end as a
 * line, on one count axis. Hover shows a day's numbers; click picks it and
 * lists its tasks below, each opening its chat tab. Always shown, also with
 * no work yet (an empty chart says so).
 */
export function ProjectProgressChart({
  projectId,
  projectHref,
}: {
  projectId: Id<"projects">;
  /** The project's work page; a listed task opens as a chat tab there. */
  projectHref: string | undefined;
}) {
  const navigate = useNavigate();
  const [tzOffsetMinutes] = useState(() => new Date().getTimezoneOffset());
  const chart = useQuery(api.projects.progressChart, { projectId, tzOffsetMinutes });
  const [selected, setSelected] = useState<number | null>(null);
  if (!chart) return null;
  const day = selected === null ? undefined : chart.days[selected];
  const detail = day ? progressDayDetail(day, chart.tasks) : undefined;
  const openTask = (task: ProgressTaskName<Id<"agentTasks">>) => {
    if (!projectHref || task.numId === undefined) return;
    navigate(
      hrefToNavigateOptions(
        toInternalRepoHref(`${projectHref}?tasks=${task.numId}&task=${task.numId}`),
      ),
    );
  };
  const empty =
    chart.totals.shipped === 0 && chart.totals.archived === 0 && chart.totals.open === 0;

  return (
    <section aria-label="Progress" className="rounded-surface bg-muted/40 p-4">
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        {(["shipped", "archived", "open"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={key === "open" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-full"}
              style={{ backgroundColor: `var(--${SERIES[key].color})` }}
            />
            {SERIES[key].label}{" "}
            <span className="tabular-nums text-foreground">{chart.totals[key]}</span>
          </span>
        ))}
        <span className="ml-auto">Last {PROJECT_PROGRESS_DAYS} days</span>
      </div>
      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet</p>
      ) : (
        <div className="h-40">
          <Suspense fallback={null}>
            <ProgressCanvas
              days={chart.days.map((d) => ({
                start: d.start,
                shipped: d.shipped.length,
                archived: d.archived.length,
                open: d.open,
              }))}
              selected={selected}
              onSelect={(index) => setSelected(index === selected ? null : index)}
            />
          </Suspense>
        </div>
      )}
      {day && detail ? (
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex items-center text-xs text-muted-foreground">
            <span className="text-foreground">{dayjs(day.start).format("ddd D MMM")}</span>
            <span className="ml-auto tabular-nums">{detail.open} open at day end</span>
          </div>
          {[
            ...detail.shipped.map((task) => ({ task, kind: "shipped" as const })),
            ...detail.archived.map((task) => ({ task, kind: "archived" as const })),
          ].map(({ task, kind }) => (
            // design-check-ignore-next-line — a full-width text row; Button would force control height and padding
            <button
              key={task.id}
              type="button"
              onClick={() => openTask(task)}
              className="flex w-full items-center gap-2 rounded-control px-1 py-1 text-left hover:bg-muted/60 focus-visible:outline-hidden"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--${SERIES[kind].color})` }}
              />
              <span className="min-w-0 flex-1 truncate">
                {task.numId !== undefined ? (
                  <span className="text-muted-foreground">#{task.numId} </span>
                ) : null}
                {task.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {SERIES[kind].label}
              </span>
            </button>
          ))}
          {detail.shipped.length + detail.archived.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing shipped or archived</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
