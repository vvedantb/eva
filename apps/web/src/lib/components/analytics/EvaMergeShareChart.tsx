"use client";

import { type ReactNode, Suspense, use } from "react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import type { ChartData, ChartOptions } from "chart.js";
import { api, type Id } from "@eva/backend";
import { Spinner } from "@vvedantb/ui";
import { Widget } from "@/lib/components/Widget";
import dayjs from "@eva/shared/dates";
import { cssColor } from "@/lib/utils/cssColor";
import { prErrorMessage } from "@/lib/prReviewQueries";
import { useChartAnimation } from "./chartMotion";

/** Lazy chart.js + react-chartjs-2 so stats pages don't pay the cost up front. */
const lineChartModules = Promise.all([
  import("react-chartjs-2"),
  import("chart.js"),
]).then(([reactChart, chartJs]) => {
  const {
    Chart: ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
  } = chartJs;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
  );
  return { Line: reactChart.Line };
});

function ShareLineChart({
  chartData,
  options,
}: {
  chartData: ChartData<"line", Array<number | null>, string>;
  options: ChartOptions<"line">;
}) {
  const { Line } = use(lineChartModules);
  return <Line data={chartData} options={options} />;
}

interface EvaMergeShareChartProps {
  repoId: Id<"githubRepos">;
  startTime: number;
  endTime: number;
  bucketSizeMs: number;
}

/**
 * Percent of merged PRs that Eva opened, per bucket. Totals come from GitHub
 * (an action), so this widget loads on its own instead of holding up the page.
 */
export function EvaMergeShareChart({
  repoId,
  startTime,
  endTime,
  bucketSizeMs,
}: EvaMergeShareChartProps) {
  const animation = useChartAnimation();
  const getEvaMergeShare = useAction(api.github.getEvaMergeShare);
  const query = useQuery({
    queryKey: [
      "stats",
      "evaMergeShare",
      repoId,
      startTime,
      endTime,
      bucketSizeMs,
    ],
    queryFn: () =>
      getEvaMergeShare({ repoId, startTime, endTime, bucketSizeMs }),
    staleTime: 10 * 60_000,
  });

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  } else if (query.data === undefined) {
    body = (
      <p className="flex h-full items-center justify-center text-sm text-destructive">
        {prErrorMessage(query.error, "Couldn't load merged PRs from GitHub")}
      </p>
    );
  } else {
    const buckets = query.data;
    const chartData = {
      labels: buckets.map((b) => dayjs(b.date).format("M/D")),
      datasets: [
        {
          label: "Merged by Eva",
          // No merges (or no history) leaves a gap: 0% would read as "none by Eva".
          data: buckets.map((b) =>
            b.covered && b.totalMerged > 0
              ? Math.round((b.evaMerged / b.totalMerged) * 100)
              : null,
          ),
          borderColor: cssColor("chart-1"),
          backgroundColor: cssColor("chart-1", 0.1),
          fill: true,
          tension: 0.4,
        },
      ],
    };
    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      animation,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const bucket = buckets[item.dataIndex];
              return `${item.formattedValue}% · ${bucket.evaMerged} of ${bucket.totalMerged} merged PRs`;
            },
          },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, callback: (value) => `${value}%` },
        },
      },
    };
    body = (
      <Suspense fallback={null}>
        <ShareLineChart chartData={chartData} options={options} />
      </Suspense>
    );
  }

  return (
    <Widget
      title="Merged by Eva"
      subtitle="Share of merged PRs that Eva opened. Bot PRs are excluded."
    >
      <div className="h-48 sm:h-64">{body}</div>
    </Widget>
  );
}
