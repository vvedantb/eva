"use client";

import { Suspense, use } from "react";
import { Widget } from "@/lib/components/Widget";
import dayjs from "@eva/shared/dates";
import { cssColor } from "@/lib/utils/cssColor";
import { CHART_ANIMATION } from "./chartMotion";

/** Lazy chart.js + react-chartjs-2 so stats pages don't pay the cost up front. */
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
  } = chartJs;
  ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);
  return { Bar: reactChart.Bar };
});

interface PRsOverTimeChartProps {
  timeline: Array<{ date: number; prsShipped: number }>;
}

function PRsBarChart({
  chartData,
  options,
}: {
  chartData: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string;
      borderColor: string;
      borderWidth: number;
      borderRadius: number;
    }>;
  };
  options: {
    responsive: boolean;
    maintainAspectRatio: boolean;
    animation: { duration: number; easing: string };
    plugins: { legend: { display: boolean } };
    scales: { y: { beginAtZero: boolean; ticks: { stepSize: number } } };
  };
}) {
  const { Bar } = use(barChartModules);
  return <Bar data={chartData} options={options} />;
}

export function PRsOverTimeChart({ timeline }: PRsOverTimeChartProps) {
  const labels = timeline.map((e) => dayjs(e.date).format("M/D"));
  const chartData = {
    labels,
    datasets: [
      {
        label: "PRs Shipped",
        data: timeline.map((e) => e.prsShipped),
        backgroundColor: cssColor("chart-1", 0.8),
        borderColor: cssColor("chart-1"),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: CHART_ANIMATION,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
  };

  return (
    <Widget
      title="PRs shipped over time"
      subtitle="Pull requests opened in this range."
    >
      <div className="h-48 sm:h-64">
        <Suspense fallback={null}>
          <PRsBarChart chartData={chartData} options={options} />
        </Suspense>
      </div>
    </Widget>
  );
}
