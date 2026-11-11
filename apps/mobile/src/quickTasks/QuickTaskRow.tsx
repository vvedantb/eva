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
import { displayTitle, timeAgo } from "@/ui/format";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { AwaitingAnswerMark } from "@/ui/RowStatus";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type QuickTask = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/** Tags drawn on a card; the rest are a "+N", so a task with a dozen tags keeps one line of them. */
const MAX_TAGS = 3;

/** The card's secondary text (number, tags, creator, age): the Inbox `text-xs` (12 / 16), not the web 10 and 11. */
export const META_TEXT = { fontSize: 12, lineHeight: 16, letterSpacing: XS_TRACKING };

/** The web sandbox dot: Awake emerald, waking or going to sleep amber, asleep muted. */
export const SANDBOX_DOT = {
  active: { light: "#10b981", dark: "#10b981", label: "Awake" },
  starting: { light: "#fbbf24", dark: "#fbbf24", label: "Waking up" },
  stopping: { light: "#fbbf24", dark: "#fbbf24", label: "Going to sleep" },
  closed: { light: undefined, dark: undefined, label: "Asleep" },
};

/**
 * One quick task, as the web `QuickTaskCard` at phone width: a card with the
 * status stripe (red with a tinted border when the latest run failed), then
 * the number and title with the priority, live mark, unread dot and schedule
 * clock; the tags; and the creator and age. Sized for a thumb, not the web
 * board: a 14 title, 12 secondary text, `py-3`, at least 72 high and 8 apart
 * (`QuickTasksSection`). A tap opens the task chat; a
 * long press opens the row menu (`onLongPress`), as the web kebab and
 * right-click. The web hover tooltips are spoken in the row's hint instead.
 */
export function QuickTaskRow({
  task,
  status,
  hasError,
  creator,
  projectNumId,
  onLongPress,
}: {
  task: QuickTask;
  status: DisplayTaskStatus;
  hasError: boolean;
  creator: User | undefined;
  /** In a project's task list: the number reads "#project/task", as the web card. */
  projectNumId?: number;
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
  const numLabel = formatEntityNumLabel({ numId: task.numId, projectNumId });
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
      accessibilityLabel={displayTitle(task.title)}
      accessibilityHint={hint}
      accentColor={showError ? theme.destructive : appearance.bar}
      backgroundColor={showError ? withAlpha(theme.destructive, 0.05) : theme.card}
      borderColor={showError ? withAlpha(theme.destructive, 0.3) : undefined}
      // The web `px-2.5 pl-3` and `gap-1.5`; `py-3` (web `py-2`) for a thumb.
      className="min-h-[72px] gap-1.5 px-3 py-3 pl-3.5"
      onPress={() => router.push({ pathname: "/chat/[target]", params: { target: task._id } })}
      onLongPress={onLongPress}
      longPressLabel="Task actions"
    >
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
          {numLabel ? (
            <Text style={{ ...META_TEXT, fontFamily: "monospace", color: withAlpha(muted, 0.55), fontVariant: ["tabular-nums"] }}>
              {numLabel}
            </Text>
          ) : null}
          {/* The web medium title at the Inbox row's 14 / 20 (web `text-2sm`, 13). */}
          <Text
            numberOfLines={1}
            className="font-instrument-sans-medium min-w-0 flex-1 text-sm"
            style={{ fontWeight: "500", color: theme.foreground }}
          >
            {displayTitle(task.title)}
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
          {task.tags.slice(0, MAX_TAGS).map((tag) => (
            // Web: a `secondary` badge, `px-1.5 font-medium`, a tag icon; 12 text and a 12 icon (web 10).
            <View
              key={tag}
              className="max-w-36 flex-row items-center gap-1 rounded-full border px-2 py-0.5"
              style={{ backgroundColor: theme.secondary, borderColor: theme.border }}
            >
              <View className="shrink-0">
                <IconTag size={12} color={theme.secondaryForeground} />
              </View>
              <Text numberOfLines={1} className="font-instrument-sans-medium shrink" style={{ ...META_TEXT, fontWeight: "500", color: theme.secondaryForeground }}>
                {tag}
              </Text>
            </View>
          ))}
          {task.tags.length > MAX_TAGS ? (
            <Text
              accessibilityLabel={`${task.tags.length - MAX_TAGS} more tags`}
              className="font-instrument-sans-medium"
              style={{ ...META_TEXT, fontWeight: "500", color: muted, fontVariant: ["tabular-nums"] }}
            >
              {`+${task.tags.length - MAX_TAGS}`}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="mt-0.5 flex-row items-center justify-between gap-2 pt-0.5">
        <View className="min-w-0 flex-row items-center gap-1.5">
          {creator ? (
            <>
              <InitialsAvatar user={creator} size={16} />
              {creatorFirstName ? (
                <Text numberOfLines={1} className="font-instrument-sans min-w-0" style={{ ...META_TEXT, color: withAlpha(muted, 0.75) }}>
                  {creatorFirstName}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
        <Text className="font-instrument-sans" style={{ ...META_TEXT, color: withAlpha(muted, 0.7), fontVariant: ["tabular-nums"] }}>
          {timeAgo(task.createdAt)}
        </Text>
      </View>
    </SurfaceRow>
  );
}
