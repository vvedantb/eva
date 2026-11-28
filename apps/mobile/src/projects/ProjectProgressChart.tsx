import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { PROJECT_PROGRESS_DAYS, progressDayDetail } from "@eva/shared/projectProgress";
import { useQuery } from "convex/react";
import dayjs from "dayjs";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { G, Line, Polyline, Rect } from "react-native-svg";
import { useScheme } from "@/ui/theme";

const CHART_HEIGHT = 140;
const BAR_WIDTH = 6;

/**
 * The phone's 30-day progress chart, as the web Project page
 * (`ProjectProgressChart`): shipped and archived tasks as stacked bars per
 * day, the tasks open at day end as a line, one count axis. Tap a day to list
 * its tasks; a task opens its chat. Always shown.
 */
export function ProjectProgressChart({ projectId }: { projectId: Id<"projects"> }) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const router = useRouter();
  const [tzOffsetMinutes] = useState(() => new Date().getTimezoneOffset());
  const chart = useQuery(api.projects.progressChart, { projectId, tzOffsetMinutes });
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  if (!chart) return null;

  const series = [
    { key: "shipped", label: "Shipped", color: theme.success, total: chart.totals.shipped },
    { key: "archived", label: "Archived", color: theme.mutedForeground, total: chart.totals.archived },
    { key: "open", label: "Open", color: theme.cat2, total: chart.totals.open },
  ];
  const max = Math.max(1, ...chart.days.map((day) => Math.max(day.open, day.shipped.length + day.archived.length)));
  const step = width / chart.days.length;
  const y = (count: number) => CHART_HEIGHT - (count / max) * (CHART_HEIGHT - 8);
  const day = selected === null ? undefined : chart.days[selected];
  const detail = day ? progressDayDetail(day, chart.tasks) : undefined;
  const empty = chart.totals.shipped === 0 && chart.totals.archived === 0 && chart.totals.open === 0;

  return (
    <View className="mt-4 gap-2 rounded-xl p-4" style={{ backgroundColor: theme.card }}>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {series.map((item) => (
          <View key={item.key} className="flex-row items-center gap-1.5">
            <View
              style={{
                width: item.key === "open" ? 12 : 9,
                height: item.key === "open" ? 2 : 9,
                borderRadius: 2,
                backgroundColor: item.color,
              }}
            />
            <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
              {item.label} <Text style={{ color: theme.foreground }}>{item.total}</Text>
            </Text>
          </View>
        ))}
        <Text className="font-instrument-sans ml-auto text-xs" style={{ color: theme.mutedForeground }}>
          Last {PROJECT_PROGRESS_DAYS} days
        </Text>
      </View>
      {empty ? (
        <Text className="font-instrument-sans py-6 text-center text-sm" style={{ color: theme.mutedForeground }}>
          No tasks yet
        </Text>
      ) : (
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height: CHART_HEIGHT }}>
          {width > 0 ? (
            <Svg width={width} height={CHART_HEIGHT}>
              <Line x1={0} y1={CHART_HEIGHT - 0.5} x2={width} y2={CHART_HEIGHT - 0.5} stroke={theme.border} strokeWidth={1} />
              {chart.days.map((d, i) => {
                const x = i * step + (step - BAR_WIDTH) / 2;
                const dim = selected !== null && selected !== i ? 0.35 : 1;
                const shippedTop = y(d.shipped.length);
                const archivedTop = y(d.shipped.length + d.archived.length);
                return (
                  <G key={d.start}>
                    {d.shipped.length > 0 ? (
                      <Rect x={x} y={shippedTop} width={BAR_WIDTH} height={CHART_HEIGHT - shippedTop} rx={2} fill={theme.success} opacity={dim} />
                    ) : null}
                    {d.archived.length > 0 ? (
                      <Rect x={x} y={archivedTop} width={BAR_WIDTH} height={Math.max(0, shippedTop - archivedTop - 2)} rx={2} fill={theme.mutedForeground} opacity={dim} />
                    ) : null}
                  </G>
                );
              })}
              <Polyline
                points={chart.days.map((d, i) => `${i * step + step / 2},${y(d.open)}`).join(" ")}
                fill="none"
                stroke={theme.cat2}
                strokeWidth={2}
              />
              {chart.days.map((d, i) => (
                <Rect
                  key={`hit-${d.start}`}
                  x={i * step}
                  y={0}
                  width={step}
                  height={CHART_HEIGHT}
                  fill="transparent"
                  onPress={() => setSelected(selected === i ? null : i)}
                />
              ))}
            </Svg>
          ) : null}
        </View>
      )}
      {day && detail ? (
        <View className="gap-1">
          <View className="flex-row items-center">
            <Text className="font-instrument-sans text-xs" style={{ color: theme.foreground }}>
              {dayjs(day.start).format("ddd D MMM")}
            </Text>
            <Text className="font-instrument-sans ml-auto text-xs" style={{ color: theme.mutedForeground }}>
              {detail.open} open at day end
            </Text>
          </View>
          {[
            ...detail.shipped.map((task) => ({ task, label: "Shipped", color: theme.success })),
            ...detail.archived.map((task) => ({ task, label: "Archived", color: theme.mutedForeground })),
          ].map(({ task, label, color }) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/chat/[target]", params: { target: task.id } })}
              className="min-h-11 flex-row items-center gap-2 active:opacity-70"
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
              <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: theme.foreground }}>
                {task.numId !== undefined ? <Text style={{ color: theme.mutedForeground }}>#{task.numId} </Text> : null}
                {task.title}
              </Text>
              <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
                {label}
              </Text>
            </Pressable>
          ))}
          {detail.shipped.length + detail.archived.length === 0 ? (
            <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
              Nothing shipped or archived
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
