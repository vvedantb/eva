import { api } from "@eva/backend";
import { parseActivityLog } from "@eva/shared/activityTrace";
import {
  COMPOSER_TASK_NOW,
  COMPOSER_TASKS_DISMISS_LABEL,
  COMPOSER_TASKS_TITLE,
  composerTaskProgress,
  composerTaskSteps,
  composerTasksLabel,
  keyedComposerTaskSteps,
  type ComposerTaskStep,
} from "@eva/shared/composerTasks";
import { EVA_THEME, type EvaThemeScheme } from "@eva/shared/evaTheme";
import { IconCheck, IconCircle, IconListCheck, IconPointFilled, IconX } from "@tabler/icons-react-native";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

type Theme = (typeof EVA_THEME)[EvaThemeScheme];

/** Eight rows show before the list scrolls, so a long plan leaves the transcript most of the screen. */
const MAX_LIST_HEIGHT = 8 * 22;

/** Every status's look in one place, from the web `TASK_STATUS_STYLE`; a new status fails the type check here. */
function statusStyle(theme: Theme, status: ComposerTaskStep["status"]) {
  switch (status) {
    case "completed":
      return { segment: theme.success, icon: theme.success, text: withAlpha(theme.mutedForeground, 0.55), Icon: IconCheck, size: 12 };
    case "in_progress":
      return { segment: theme.primary, icon: theme.primary, text: withAlpha(theme.foreground, 0.9), Icon: IconPointFilled, size: 12 };
    case "pending":
      return {
        segment: withAlpha(theme.mutedForeground, 0.25),
        icon: withAlpha(theme.mutedForeground, 0.4),
        text: withAlpha(theme.mutedForeground, 0.7),
        Icon: IconCircle,
        size: 10,
      };
  }
}

/**
 * The web `ComposerTasksPanel` above the composer: the running turn's task
 * list as one line (Tasks, the current step, done/total and a segment per
 * step), which folds open to every step. The X hides it for this turn; the
 * next turn brings it back. It reads the streaming row itself (the same
 * subscription as the live reply), so typing in the composer does not redraw it.
 */
export function ComposerTasksPanel({
  streamingEntityId,
  turnId,
}: {
  /** The chat's streaming row (`chatStreamingEntityId`). */
  streamingEntityId: string | undefined;
  /** The live reply the steps belong to; undefined while no turn runs (no panel). */
  turnId: string | undefined;
}) {
  const theme = EVA_THEME[useScheme()];
  const [expanded, setExpanded] = useState(false);
  const [dismissedTurnId, setDismissedTurnId] = useState<string | null>(null);
  const streaming = useQuery(api.streaming.get, streamingEntityId && turnId ? { entityId: streamingEntityId } : "skip");
  // Deferred, as the live reply: the payload is large and changes on every token.
  const activity = useDeferredValue(streaming?.currentActivity);
  // Most turns have no task list: skip the full parse until one is in the payload.
  const steps = activity?.includes('"todos"') ? composerTaskSteps(parseActivityLog(activity)) : [];
  const progress = turnId !== undefined && dismissedTurnId !== turnId ? composerTaskProgress(steps) : null;
  if (!progress || turnId === undefined) return null;

  return (
    // The queue panel's look: a `bg-muted/50` card with a 16 top radius, flush on what is under it.
    <View
      className="-mb-2 mx-6 rounded-t-2xl border border-b-0 px-1.5 pt-0.5"
      style={{ backgroundColor: withAlpha(theme.muted, 0.5), borderColor: theme.border }}
    >
      <View className="flex-row items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={composerTasksLabel(progress)}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          className="min-h-11 min-w-0 flex-1 flex-row items-center gap-2 rounded-md px-1 active:opacity-70"
        >
          <IconListCheck size={14} color={theme.mutedForeground} />
          <Text className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
            {COMPOSER_TASKS_TITLE}
          </Text>
          {expanded ? (
            <View className="flex-1" />
          ) : (
            <Text numberOfLines={1} className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: withAlpha(theme.foreground, 0.8) }}>
              {progress.step}
            </Text>
          )}
          <Text
            className="font-instrument-sans-medium text-sm"
            style={{ fontWeight: "500", fontVariant: ["tabular-nums"], color: progress.allDone ? theme.success : theme.mutedForeground }}
          >
            {progress.completedSteps}/{progress.totalSteps}
          </Text>
          {expanded ? null : <TaskSegments theme={theme} steps={steps} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COMPOSER_TASKS_DISMISS_LABEL}
          onPress={() => setDismissedTurnId(turnId)}
          className="size-11 items-center justify-center rounded-md active:opacity-70"
        >
          <IconX size={14} color={theme.mutedForeground} />
        </Pressable>
      </View>
      {expanded ? (
        <ScrollView style={{ maxHeight: MAX_LIST_HEIGHT }} nestedScrollEnabled contentContainerClassName="px-1 pb-3" accessibilityRole="list">
          {keyedComposerTaskSteps(steps).map(({ key, step }) => (
            <TaskStepRow key={key} theme={theme} step={step} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** One 3-high bar per step in its status colour, 80 wide, as the web; a one-step list has none. */
function TaskSegments({ theme, steps }: { theme: Theme; steps: readonly ComposerTaskStep[] }) {
  if (steps.length <= 1) return null;
  return (
    <View className="w-20 flex-row items-center gap-0.5" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {keyedComposerTaskSteps(steps).map(({ key, step }) => (
        <View key={key} className="h-[3px] min-w-0 flex-1 rounded-full" style={{ backgroundColor: statusStyle(theme, step.status).segment }} />
      ))}
    </View>
  );
}

/** A step: its status mark, its text, and "now" on the one in progress. */
function TaskStepRow({ theme, step }: { theme: Theme; step: ComposerTaskStep }) {
  const style = statusStyle(theme, step.status);
  return (
    <View className="min-h-[22px] flex-row items-center gap-2">
      <View className="w-3 items-center justify-center">
        <style.Icon size={style.size} color={style.icon} />
      </View>
      <Text className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: style.text }}>
        {step.content}
      </Text>
      <Text className="font-instrument-sans w-12 text-right text-xs" style={{ fontVariant: ["tabular-nums"], color: withAlpha(theme.mutedForeground, 0.45) }}>
        {step.status === "in_progress" ? COMPOSER_TASK_NOW : ""}
      </Text>
    </View>
  );
}
