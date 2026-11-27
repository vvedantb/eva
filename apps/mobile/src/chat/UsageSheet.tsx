import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  aggregateUsage,
  CONTEXT_OVERLOAD_RATIO,
  contextCompactsAutomatically,
  contextUsedRatio,
} from "@eva/shared/contextUsage";
import {
  emptyAccountUsageCopy,
  formatUtilization,
  newestCapturedAt,
  providerHeading,
  reportedWindows,
  resetsInLabel,
  snapshotOf,
  snapshotsOf,
  toneForUtilization,
  USAGE_REFRESH_FAILED,
  usageRefreshFailure,
  type UsageAccountEntry,
  type UsageTone,
} from "@eva/shared/usageLimits";
import { formatCompactRelativeTime, Spinner } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { FooterSheet, useSimpleView } from "@/chat/ComposerFooter";
import type { Chat } from "@/chat/useChatModelPick";
import { useNow } from "@/ui/clock";
import { useScheme } from "@/ui/theme";

type Aggregated = NonNullable<ReturnType<typeof aggregateUsage>>;

const META = { fontSize: 12, lineHeight: 16 };

function compactTokens(value: number): string {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const scaled = value / size;
      return `${scaled < 10 ? Number(scaled.toFixed(1)) : Math.round(scaled)}${suffix}`;
    }
  }
  return String(Math.round(value));
}

function percent(ratio: number): string {
  return `${Number((ratio * 100).toFixed(1))}%`;
}

function useChatUsage(chat: Chat, skip: boolean): Aggregated | null {
  const entityId = chat.task ? chat.task.id : chat.project ? undefined : chat.parentId;
  const entityLogs = useQuery(api.logs.getByEntityId, !skip && entityId ? { repoId: chat.repoId, entityId } : "skip");
  const projectLogs = useQuery(api.logs.getByProjectId, !skip && chat.project ? { repoId: chat.repoId, projectId: chat.project.id } : "skip");
  return aggregateUsage(chat.project ? projectLogs : entityLogs);
}

/**
 * The web chat header's context ring and plan-usage chip as one header button
 * on the phone: the ring and the context used. It turns red past 90%, as the
 * web. A tap opens the usage sheet: the context card, then every Claude
 * account's plan windows. Opening it refreshes the plan readings, as opening
 * the web card does. Hidden in simple view, as on the web.
 */
export function UsageButton({ chat }: { chat: Chat }) {
  const theme = EVA_THEME[useScheme()];
  const simpleView = useSimpleView();
  const usage = useChatUsage(chat, simpleView);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = useAction(api.usageLimitsActions.refreshAll);
  const openSheet = async () => {
    setOpen(true);
    if (refreshing) return;
    setRefreshing(true);
    try {
      const response = await refreshAll({ repoId: chat.repoId });
      for (const result of response.results) {
        const failure = usageRefreshFailure(result);
        if (failure) toast.error(failure);
      }
    } catch {
      toast.error(USAGE_REFRESH_FAILED);
    }
    setRefreshing(false);
  };
  if (simpleView) return null;
  const ratio = usage ? contextUsedRatio(usage.usedTokens, usage.maxTokens) : 0;
  const color = ratio > CONTEXT_OVERLOAD_RATIO ? theme.destructive : theme.mutedForeground;
  const label = usage && usage.maxTokens !== null ? percent(ratio) : "—";
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Usage: context ${label === "—" ? "unknown" : `${label} used`}`}
        accessibilityHint="Opens context and plan usage"
        onPress={() => void openSheet()}
        hitSlop={4}
        className="h-11 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70"
      >
        <Text className="font-instrument-sans-medium" style={{ ...META, color, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
          {label}
        </Text>
        <ContextRing ratio={ratio} color={color} />
      </Pressable>
      <UsageSheet open={open} onOpenChange={setOpen} chat={chat} usage={usage} refreshing={refreshing} />
    </>
  );
}

function ContextRing({ ratio, color }: { ratio: number; color: string }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={radius} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={2} />
      <Circle
        cx={12}
        cy={12}
        r={radius}
        fill="none"
        stroke={color}
        strokeOpacity={0.7}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - Math.min(ratio, 1))}
        transform="rotate(-90 12 12)"
      />
    </Svg>
  );
}

function UsageSheet({
  open,
  onOpenChange,
  chat,
  usage,
  refreshing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: Chat;
  usage: Aggregated | null;
  refreshing: boolean;
}) {
  const now = useNow(60_000);
  const entries = useQuery(api.usageLimits.getForViewer, open ? { repoId: chat.repoId, now } : "skip");

  return (
    <FooterSheet open={open} onOpenChange={onOpenChange} title="Usage">
      <View className="gap-5 px-2 pb-4">
        <Section title="Context">{usage ? <ContextCard usage={usage} /> : <Muted>No turns have run in this chat yet.</Muted>}</Section>
        <Section title="Plan usage" trailing={refreshing ? <Spinner size="sm" accessibilityLabel="Refreshing plan usage" /> : null}>
          {entries === undefined ? (
            <Spinner size="sm" />
          ) : entries.length === 0 ? (
            <Muted>No Claude accounts connected. Connect one in Settings to see plan usage.</Muted>
          ) : (
            <PlanUsage entries={entries} now={now} />
          )}
        </Section>
      </View>
    </FooterSheet>
  );
}

function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <View className="gap-2">
      <View className="min-h-6 flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-instrument-sans-medium text-sm" style={{ color: muted, fontWeight: "500" }}>
          {title}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function Muted({ children }: { children: ReactNode }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <Text className="font-instrument-sans text-sm" style={{ color: muted }}>
      {children}
    </Text>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="font-instrument-sans min-w-0 shrink text-sm" style={{ color: theme.mutedForeground }}>
        {label}
      </Text>
      <Text className="font-instrument-sans text-sm" style={{ color: color ?? theme.foreground, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

/** The web usage bar: a 4-high track, the fill in the tone's colour. */
export function UsageBar({ ratio, color }: { ratio: number; color: string }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: theme.muted }}>
      <View className="h-full rounded-full" style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`, backgroundColor: color }} />
    </View>
  );
}

export function useToneColor(): (tone: UsageTone) => { text: string; fill: string } {
  const theme = EVA_THEME[useScheme()];
  return (tone) =>
    tone === "danger"
      ? { text: theme.destructive, fill: theme.destructive }
      : tone === "warning"
        ? { text: theme.warning, fill: theme.warning }
        : { text: theme.mutedForeground, fill: theme.primary };
}

function ContextCard({ usage }: { usage: Aggregated }) {
  const theme = EVA_THEME[useScheme()];
  const { maxTokens, usedTokens } = usage;
  const ratio = contextUsedRatio(usedTokens, maxTokens);
  const overloaded = ratio > CONTEXT_OVERLOAD_RATIO;
  const rows = [
    { label: "Input", tokens: usage.usage.inputTokens },
    { label: "Output", tokens: usage.usage.outputTokens },
    { label: "Cache read", tokens: usage.usage.cachedInputReadTokens },
    { label: "Cache write", tokens: usage.usage.cachedInputWriteTokens },
  ].filter((row) => row.tokens > 0);
  return (
    <View className="gap-2">
      {maxTokens === null ? (
        <>
          <Row label="Context window unknown for this model" value={`${compactTokens(usedTokens)} used`} />
        </>
      ) : (
        <>
          <Row label={percent(ratio)} value={`${compactTokens(usedTokens)} / ${compactTokens(maxTokens)}`} color={overloaded ? theme.destructive : undefined} />
          <UsageBar ratio={ratio} color={overloaded ? theme.destructive : theme.primary} />
        </>
      )}
      <View className="gap-1 pt-1">
        {rows.map((row) => (
          <Row key={row.label} label={row.label} value={compactTokens(row.tokens)} />
        ))}
      </View>
      {maxTokens === null ? null : (
        <Text className="font-instrument-sans" style={{ ...META, color: theme.mutedForeground }}>
          {`${compactTokens(Math.max(0, maxTokens - usedTokens))} tokens left${overloaded ? " · window is nearly full" : ""}`}
        </Text>
      )}
      {contextCompactsAutomatically(usage.model) ? (
        <Text className="font-instrument-sans" style={{ ...META, color: theme.mutedForeground }}>
          Context compacts automatically when needed.
        </Text>
      ) : null}
      <View className="mt-1 border-t pt-2" style={{ borderColor: theme.border }}>
        <Row label="Total cost" value={`$${usage.costs.totalUSD.toFixed(2)}`} />
      </View>
    </View>
  );
}

function PlanUsage({ entries, now }: { entries: readonly UsageAccountEntry[]; now: number }) {
  const theme = EVA_THEME[useScheme()];
  const toneColor = useToneColor();
  const capturedAt = newestCapturedAt(snapshotsOf(entries));
  return (
    <View className="gap-4">
      {entries.map((entry) => {
        const snapshot = snapshotOf(entry);
        const windows = snapshot === undefined ? [] : reportedWindows(snapshot, now);
        return (
          <View key={entry.providerAccountId ?? "team"} className="gap-2">
            <Text className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
              {snapshot === undefined ? "Claude" : providerHeading(snapshot)}
              <Text className="font-instrument-sans" style={{ color: theme.mutedForeground, fontWeight: "400" }}>
                {` · ${entry.accountLabel}`}
              </Text>
            </Text>
            {windows.length === 0 ? (
              <Muted>{emptyAccountUsageCopy(snapshot === undefined ? [] : [snapshot], now)}</Muted>
            ) : (
              windows.map((usageWindow) => {
                const utilization = usageWindow.utilization ?? 0;
                const colors = toneColor(toneForUtilization(utilization));
                return (
                  <View key={usageWindow.key} className="gap-1">
                    <Row label={usageWindow.label} value={formatUtilization(utilization)} color={colors.text} />
                    <UsageBar ratio={utilization / 100} color={colors.fill} />
                    {usageWindow.resetsAt === undefined ? null : (
                      <Text className="font-instrument-sans" style={{ ...META, color: theme.mutedForeground }}>
                        {resetsInLabel(usageWindow.resetsAt, now)}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </View>
        );
      })}
      {capturedAt === undefined ? null : (
        <Text className="font-instrument-sans" style={{ ...META, color: withAlpha(theme.mutedForeground, 0.8) }}>
          {`updated ${formatCompactRelativeTime(capturedAt)} ago`}
        </Text>
      )}
    </View>
  );
}

