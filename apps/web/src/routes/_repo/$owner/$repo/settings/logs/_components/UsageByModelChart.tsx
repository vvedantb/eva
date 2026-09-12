"use client";

import { Suspense, use } from "react";
import { Widget } from "@/lib/components/Widget";
import { cssColor } from "@/lib/utils/cssColor";
import {
  buildUsageSeries,
  formatBucketLabel,
  formatCost,
  type UsageBucketSize,
  type UsageChartBucket,
} from "../_utils";
import { CHART_ANIMATION } from "@/lib/components/analytics/chartMotion";

/** Lazy chart.js + react-chartjs-2 so the settings bundle does not pay for it up front. */
const barChartModules = Promise.all([
  import("react-chartjs-2"),
  import("chart.js"),
]).then(([reactChart, chartJs]) => {
  const {
    Chart: ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Tooltip,
    Legend,
  } = chartJs;
  ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
  return { Bar: reactChart.Bar };
});

const SERIES_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

interface UsageByModelChartProps {
  buckets: ReadonlyArray<UsageChartBucket>;
  /** Every bucket start in the range, including empty ones. */
  starts: ReadonlyArray<number>;
  bucket: UsageBucketSize;
}

interface StackedBarProps {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string;
    borderRadius: number;
  }>;
}

function StackedBar({ labels, datasets }: StackedBarProps) {
  const { Bar } = use(barChartModules);
  return (
    <Bar
      data={{ labels, datasets }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        animation: CHART_ANIMATION,
        plugins: {
          legend: { display: datasets.length > 1, position: "bottom" },
          tooltip: {
            callbacks: {
              label: (item) =>
                `${item.dataset.label}: ${formatCost(Number(item.raw))}`,
            },
          },
        },
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { callback: (value) => formatCost(Number(value)) },
          },
        },
      }}
    />
  );
}

/** Spend per bucket, stacked by model; hourly bars for 24h, daily otherwise. */
export function UsageByModelChart({
  buckets,
  starts,
  bucket,
}: UsageByModelChartProps) {
  const series = buildUsageSeries(buckets, starts);
  const datasets = series.map((entry, index) => ({
    label: entry.model,
    data: entry.data,
    backgroundColor: cssColor(
      SERIES_TOKENS[index % SERIES_TOKENS.length] ?? "chart-1",
      0.85,
    ),
    borderRadius: 2,
  }));

  return (
    <Widget
      title="Spend over time"
      subtitle={
        bucket === "hour"
          ? "Per hour, stacked by model."
          : "Per day, stacked by model."
      }
    >
      <div className="h-56 sm:h-72">
        <Suspense fallback={null}>
          <StackedBar
            labels={starts.map((start) => formatBucketLabel(start, bucket))}
            datasets={datasets}
          />
        </Suspense>
      </div>
    </Widget>
  );
}
