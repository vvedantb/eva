import type { api } from "@eva/backend";
import { TASK_STATUS_LABELS, firstNameFromUser, formatEntityNumLabel, type DisplayTaskStatus } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconClock, IconTag } from "@tabler/icons-react-native";
import { Spinner, SurfaceRow } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { FunctionReturnType } from "convex/server";
import dayjs from "dayjs";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { PriorityIcon } from "@/quickTasks/PriorityIcon";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { timeAgo } from "@/ui/format";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { AwaitingAnswerMark } from "@/ui/RowStatus";
import { useScheme } from "@/ui/theme";

type QuickTask = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/** The web `text-2xs` (11 / 16, 0.01em) and `text-3xs` (10 / 14). */
const TEXT_2XS = { fontSize: 11, lineHeight: 16, letterSpacing: 0.11 };
const TEXT_3XS = { fontSize: 10, lineHeight: 14, letterSpacing: 0.1 };

/** The web sandbox dot: Awake emerald, waking or going to sleep amber, asleep muted. */
const SANDBOX_DOT = {
  active: { light: "#10b981", dark: "#10b981", label: "Awake" },
  starting: { light: "#fbbf24", dark: "#fbbf24", label: "Waking up" },
  stopping: { light: "#fbbf24", dark: "#fbbf24", label: "Going to sleep" },
  closed: { light: undefined, dark: undefined, label: "Asleep" },
};

/**
 * One quick task, as the web `QuickTaskCard` at phone width: a card with the
 * status stripe (red with a tinted border when the latest run failed), then
 * the number and title with the priority, live mark, unread dot and schedule
 * clock; the tags; and the creator and age. A tap opens the task chat; a
 * long press opens the row menu (`onLongPress`), as the web kebab and
 * right-click. The web hover tooltips are spoken in the row's hint instead.
 */
export function QuickTaskRow({
  task,
  status,
  hasError,
  creator,
  onLongPress,
}: {
  task: QuickTask;
  status: DisplayTaskStatus;
  hasError: boolean;
  creator: User | undefined;
  onLongPress: () => void;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const simpleView = useSimpleView();
  const showError = hasError && status !== "done";
  const appearance = statusAppearance(status, scheme);
  // The web: one live mark, never two. A question beats a turn in flight,
  // which beats the sandbox dot. An in-progress task gets no turn mark,
  // because the web draws its border beam instead; the phone has no beam.
  const isInProgress = !hasError && status === "in_progress";
  const showWorking = !hasError && !isInProgress && task.isExecuting;
  const sandbox = task.reviewTaskSandboxStatus ? SANDBOX_DOT[task.reviewTaskSandboxStatus] : undefined;
  const showSandbox = sandbox !== undefined && !simpleView;
  const showUnread = task.hasUnread && !task.isExecuting;
  const numLabel = formatEntityNumLabel({ numId: task.numId });
  const creatorFirstName = creator ? firstNameFromUser(creator) : null;
  const scheduled = task.scheduledAt
    ? `${status === "todo" ? "Scheduled for" : "Was scheduled for"} ${dayjs(task.scheduledAt).format("MMM D, h:mm A")}`
    : undefined;
  const hint = [
    TASK_STATUS_LABELS[status],
    showError ? "Latest run failed" : undefined,
    task.isAwaitingAnswer ? "Eva asked you a question" : showWorking ? "Eva is replying" : showSandbox ? sandbox.label : undefined,
    showUnread ? "Unread" : undefined,
    scheduled,
  ]
    .filter(Boolean)
    .join(", ");
  const muted = theme.mutedForeground;

  return (
    <SurfaceRow
      accessibilityLabel={task.title}
      accessibilityHint={hint}
      accentColor={showError ? theme.destructive : appearance.bar}
      backgroundColor={showError ? withAlpha(theme.destructive, 0.05) : theme.card}
      borderColor={showError ? withAlpha(theme.destructive, 0.3) : undefined}
      // Web: `px-2.5 py-2 pl-3`, the three lines `gap-1.5`.
      className="gap-1.5 px-2.5 py-2 pl-3"
      onPress={() => router.push({ pathname: "/chat/[target]", params: { target: task._id } })}
      onLongPress={onLongPress}
      longPressLabel="Task actions"
    >
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
          {numLabel ? (
            <Text style={{ ...TEXT_2XS, fontFamily: "monospace", color: withAlpha(muted, 0.55), fontVariant: ["tabular-nums"] }}>
              {numLabel}
            </Text>
          ) : null}
          {/* Web: `text-2sm font-medium leading-5 tracking-[-0.01em]`. */}
          <Text
            numberOfLines={1}
            className="font-instrument-sans-medium min-w-0 flex-1"
            style={{ fontSize: 13, lineHeight: 20, letterSpacing: -0.13, fontWeight: "500", color: theme.foreground }}
          >
            {task.title}
          </Text>
        </View>
        <View className="shrink-0 flex-row items-center gap-1.5 pt-0.5">
          {task.priority ? <PriorityIcon level={task.priority} /> : null}
          {task.isAwaitingAnswer ? (
            <AwaitingAnswerMark />
          ) : showWorking ? (
            <Spinner size="sm" decorative />
          ) : showSandbox ? (
            <View
              className="size-2 rounded-full"
              style={{ backgroundColor: sandbox[scheme] ?? withAlpha(muted, 0.4) }}
            />
          ) : null}
          {showUnread ? <View className="size-1.5 rounded-full" style={{ backgroundColor: theme.primary }} /> : null}
          {scheduled ? <IconClock size={14} color={theme.primary} /> : null}
        </View>
      </View>

      {task.tags && task.tags.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-1">
          {task.tags.map((tag) => (
            // Web: a `secondary` badge, `px-1.5 text-3xs font-medium`, a 10 tag icon.
            <View
              key={tag}
              className="max-w-28 flex-row items-center gap-0.5 rounded-full border px-1.5"
              style={{ backgroundColor: theme.secondary, borderColor: theme.border }}
            >
              <IconTag size={10} color={theme.secondaryForeground} />
              <Text numberOfLines={1} className="font-instrument-sans-medium" style={{ ...TEXT_3XS, fontWeight: "500", color: theme.secondaryForeground }}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-0.5 flex-row items-center justify-between gap-2 pt-0.5">
        <View className="min-w-0 flex-row items-center gap-1.5">
          {creator ? (
            <>
              <InitialsAvatar user={creator} size={16} />
              {creatorFirstName ? (
                <Text numberOfLines={1} className="font-instrument-sans min-w-0" style={{ ...TEXT_2XS, color: withAlpha(muted, 0.75) }}>
                  {creatorFirstName}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
        <Text className="font-instrument-sans" style={{ ...TEXT_2XS, color: withAlpha(muted, 0.7), fontVariant: ["tabular-nums"] }}>
          {timeAgo(task.createdAt)}
        </Text>
      </View>
    </SurfaceRow>
  );
}
