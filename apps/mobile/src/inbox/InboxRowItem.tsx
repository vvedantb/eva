import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { inboxDoneTarget, inboxNewCountLabel } from "@eva/shared/inbox";
import { IconCheck } from "@tabler/icons-react-native";
import { Badge, Button, SwipeableRow, swipeActionsAccessibility, type SwipeAction } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { Pressable, Text, View } from "react-native";
import { openAppLink } from "@/push/openLink";
import { timeAgo } from "@/ui/format";
import { useScheme, XS_TRACKING } from "@/ui/theme";

export type InboxRow = FunctionReturnType<typeof api.inbox.list>[number];

/**
 * One Inbox row, as the web `InboxRowItem` at phone width: the unread dot,
 * where it is from and the age, the title, and one line of the latest message
 * with its counts. A tap opens the chat (or its thread, or the page). Swipe
 * left is Done when Done can act on the row (`inboxDoneTarget`); the row's
 * one action (Reply, Open PR, Retry) sits at its end.
 */
export function InboxRowItem({ row, onDone }: { row: InboxRow; onDone: (row: InboxRow) => Promise<void> }) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const open = () =>
    openAppLink({ chatTarget: row.chatTarget, threadRootId: row.threadRootId, href: row.href, repoId: row.repoId });
  const doneAction: SwipeAction | undefined = inboxDoneTarget(row)
    ? { key: "done", label: "Done", icon: IconCheck, onPress: () => onDone(row), exits: true }
    : undefined;
  const actions = doneAction ? [doneAction] : [];
  return (
    <SwipeableRow trailingActions={actions} enabled={actions.length > 0}>
      <View className="flex-row items-center gap-3 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.title}
          {...swipeActionsAccessibility(actions)}
          onPress={open}
          className="min-w-0 flex-1 py-3 active:opacity-70"
        >
          <View className="min-w-0 flex-row items-center gap-1.5">
            <View className="w-1.5 items-center">
              {row.unread ? (
                <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EVA_THEME[scheme].primary }} />
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 font-instrument-sans text-xs"
              style={{ color: muted, letterSpacing: XS_TRACKING }}
            >
              {row.contextLabel}
            </Text>
            <Text
              className="font-instrument-sans text-xs"
              style={{ color: muted, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
            >
              {timeAgo(row.at)}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            className="pl-3 font-instrument-sans-medium text-sm"
            style={{ color: EVA_THEME[scheme].foreground, fontWeight: "500" }}
          >
            {row.title}
          </Text>
          {row.preview || row.newCount !== undefined ? (
            <View className="min-w-0 flex-row items-center gap-1.5 pl-3">
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 font-instrument-sans text-xs leading-relaxed"
                style={{ color: muted, letterSpacing: XS_TRACKING }}
              >
                {row.preview}
              </Text>
              {row.newCount !== undefined ? (
                <Badge variant="secondary" textClassName="text-xs">
                  {inboxNewCountLabel(row.newCount)}
                </Badge>
              ) : null}
            </View>
          ) : null}
        </Pressable>
        <InboxRowAction row={row} onReply={open} />
      </View>
    </SwipeableRow>
  );
}

/** The row's one action, as the web bar: Reply to a question, Open PR, Retry. */
function InboxRowAction({ row, onReply }: { row: InboxRow; onReply: () => void }) {
  const retry = useMutation(api.agentTasks.startExecution);
  const { prUrl, taskId } = row;
  if (row.action === "answer") {
    return (
      <Button size="sm" variant="outline" fullWidth={false} onPress={onReply}>
        Reply
      </Button>
    );
  }
  if (row.action === "review" && prUrl) {
    return (
      <Button size="sm" fullWidth={false} onPress={() => void WebBrowser.openBrowserAsync(prUrl)}>
        Open PR
      </Button>
    );
  }
  if (row.action === "retry" && taskId) {
    return (
      <Button
        size="sm"
        variant="outline"
        fullWidth={false}
        onPress={() => retry({ id: taskId }).catch(() => toast.error("Couldn't retry the task", { id: "inbox-retry" }))}
      >
        Retry
      </Button>
    );
  }
  return null;
}
