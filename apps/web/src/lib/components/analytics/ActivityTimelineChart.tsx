"use client";

import { Suspense, use } from "react";
import { Widget } from "@/lib/components/Widget";
import dayjs from "@eva/shared/dates";
import { cssColor } from "@/lib/utils/cssColor";
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
    Legend,
  } = chartJs;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
  );
  return { Line: reactChart.Line };
});

interface ActivityTimelineChartProps {
  timeline: Array<{
    date: number;
    sessions: number;
    runs: number;
    tasks: number;
  }>;
}

function ActivityLineChart({
  chartData,
  options,
}: {
  chartData: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
    }>;
  };
  options: {
    responsive: boolean;
    maintainAspectRatio: boolean;
    animation: { duration: number; easing: string } | false;
    plugins: { legend: { display: boolean } };
    scales: { y: { beginAtZero: boolean; ticks: { stepSize: number } } };
  };
}) {
  const { Line } = use(lineChartModules);
  return <Line data={chartData} options={options} />;
}

export function ActivityTimelineChart({
  timeline,
}: ActivityTimelineChartProps) {
  const animation = useChartAnimation();
  const labels = timeline.map((e) => dayjs(e.date).format("M/D"));
  const chartData = {
    labels,
    datasets: [
      {
        label: "Sessions",
        data: timeline.map((e) => e.sessions),
        borderColor: cssColor("chart-2"),
        backgroundColor: cssColor("chart-2", 0.1),
        fill: true,
        tension: 0.4,
      },
      {
        label: "Runs",
        data: timeline.map((e) => e.runs),
        borderColor: cssColor("chart-4"),
        backgroundColor: cssColor("chart-4", 0.1),
        fill: true,
        tension: 0.4,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
  };

  return (
    <Widget
      title="Activity over time"
      subtitle="Sessions and runs by day."
      actions={
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: cssColor("chart-2") }}
            />
            Sessions
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: cssColor("chart-4") }}
            />
            Runs
          </span>
        </div>
      }
    >
      <div className="h-48 sm:h-64">
        <Suspense fallback={null}>
          <ActivityLineChart chartData={chartData} options={options} />
        </Suspense>
      </div>
    </Widget>
  );
}
