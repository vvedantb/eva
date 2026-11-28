import { api } from "@eva/backend";
import { getNotificationAppearance } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { inboxDoneTarget, inboxNewCountLabel, joinInboxLine } from "@eva/shared/inbox";
import { IconCheck } from "@tabler/icons-react-native";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  SwipeableRow,
  swipeActionsAccessibility,
  type SwipeAction,
} from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { Pressable, Text, View } from "react-native";
import { openAppLink } from "@/push/openLink";
import { timeAgo } from "@/ui/format";
import { RepoLogo } from "@/ui/RepoLogo";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { NOTIFICATION_ICONS, toneColors } from "./notificationAppearance";

export type InboxRow = FunctionReturnType<typeof api.inbox.list>[number];

/** The repo fields the leading mark reads. */
export type InboxRepo = { label: string; logoUrl?: string | null };

/**
 * One Inbox row, flat as the old notification feed and the web `InboxRowItem`
 * at phone width: the unread dot, the repo logo (the type glyph for a
 * notification with no repo), the title over one muted line (where it is from,
 * then the latest message), the age, and the type glyph. The list draws the
 * hairlines. A tap opens the chat (or its thread, or the page). Swipe left is
 * Done when Done can act on the row (`inboxDoneTarget`); the row's one action
 * (Reply, Open PR, Retry) sits at its end.
 */
export function InboxRowItem({
  row,
  repo,
  onDone,
}: {
  row: InboxRow;
  repo: InboxRepo | undefined;
  onDone: (row: InboxRow) => Promise<void>;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const open = () =>
    openAppLink({ chatTarget: row.chatTarget, threadRootId: row.threadRootId, href: row.href, repoId: row.repoId });
  const doneAction: SwipeAction | undefined = inboxDoneTarget(row)
    ? { key: "done", label: "Done", icon: IconCheck, onPress: () => onDone(row), exits: true }
    : undefined;
  const actions = doneAction ? [doneAction] : [];
  const appearance = row.notice ? getNotificationAppearance(row.notice) : undefined;
  const Glyph = appearance ? NOTIFICATION_ICONS[appearance.icon] : undefined;
  const tone = appearance ? toneColors(appearance.tone, scheme) : undefined;
  const detail = joinInboxLine(row.contextLabel, row.preview, " · ");
  return (
    <SwipeableRow trailingActions={actions} enabled={actions.length > 0}>
      <View className="flex-row items-center gap-3 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.title}
          {...swipeActionsAccessibility(actions)}
          onPress={open}
          className="min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-70"
        >
          <View className="w-1.5 items-center">
            {row.unread ? (
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EVA_THEME[scheme].primary }} />
            ) : null}
          </View>
          {repo ? (
            <RepoMark repo={repo} />
          ) : Glyph && tone ? (
            <Avatar size={32} style={{ backgroundColor: EVA_THEME[scheme].muted }}>
              <AvatarFallback style={{ backgroundColor: tone.tint }}>
                <Glyph size={16} color={tone.glyph} />
              </AvatarFallback>
            </Avatar>
          ) : null}
          <View className="min-w-0 flex-1">
            <View className="min-w-0 flex-row items-center gap-1.5">
              <Text
                numberOfLines={1}
                className={row.unread ? "min-w-0 flex-1 font-instrument-sans-medium text-sm" : "min-w-0 flex-1 font-instrument-sans text-sm"}
                style={row.unread ? { color: EVA_THEME[scheme].foreground, fontWeight: "500" } : { color: muted }}
              >
                {row.title}
              </Text>
              {row.newCount !== undefined ? (
                <Badge variant="secondary" textClassName="text-xs">
                  {inboxNewCountLabel(row.newCount)}
                </Badge>
              ) : null}
            </View>
            {detail ? (
              <Text
                numberOfLines={1}
                className="font-instrument-sans text-xs leading-relaxed"
                style={{ color: muted, letterSpacing: XS_TRACKING }}
              >
                {detail}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <InboxRowAction row={row} onReply={open} />
        <Text
          className="font-instrument-sans text-xs"
          style={{ color: muted, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
        >
          {timeAgo(row.at)}
        </Text>
        {Glyph && tone && appearance ? (
          <Glyph size={16} color={tone.glyph} accessibilityLabel={appearance.label} />
        ) : null}
      </View>
    </SwipeableRow>
  );
}

function RepoMark({ repo }: { repo: InboxRepo }) {
  const scheme = useScheme();
  return (
    <RepoLogo
      logoUrl={repo.logoUrl}
      size={28}
      fallback={
        <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: EVA_THEME[scheme].muted }}>
          <Text className="font-instrument-sans-semibold text-xs" style={{ color: EVA_THEME[scheme].mutedForeground, fontWeight: "600" }}>
            {repo.label.charAt(0).toUpperCase()}
          </Text>
        </View>
      }
    />
  );
}

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
