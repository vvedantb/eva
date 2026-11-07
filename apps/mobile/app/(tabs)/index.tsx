import { api, type Doc } from "@eva/backend";
import { formatDayLabel } from "@eva/shared/dayLabel";
import { IconInbox } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader, SectionLabel } from "@vvedantb/native-ui/layout";
import { CenteredSpinner, DividedList, EmptyState } from "@vvedantb/native-ui/primitives";
import { tokens, useLargerText } from "@vvedantb/native-ui/theme";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_URL } from "@/config";
import { NotificationRow } from "@/inbox/NotificationRow";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

/** Newest-first notifications in day groups ("Today", "Yesterday", …), as the web inbox list. */
function groupByDay(notifications: ReadonlyArray<Doc<"notifications">>) {
  const groups: Array<{ label: string; items: Doc<"notifications">[] }> = [];
  for (const notification of notifications) {
    const label = formatDayLabel(notification.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(notification);
    else groups.push({ label, items: [notification] });
  }
  return groups;
}

/** The web inbox (api.notifications.list) at phone width. Tap opens the chat. */
export default function InboxScreen() {
  const notifications = useQuery(api.notifications.list, {});
  const repos = useQuery(api.githubRepos.list, {});
  const markAsRead = useMutation(api.notifications.markAsRead);
  const router = useRouter();
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const repoLabels = new Map((repos ?? []).map((repo) => [repo._id, repo.label ?? repo.name]));

  const open = (notification: Doc<"notifications">) => {
    if (!notification.read) void markAsRead({ id: notification._id });
    if (notification.chatTarget) {
      router.push({ pathname: "/chat/[target]", params: { target: notification.chatTarget } });
    } else if (notification.href) {
      // Docs, comments and older rows have no chat: open them on the web.
      void Linking.openURL(`${WEB_URL}${notification.href}`);
    }
  };

  const groups = groupByDay(notifications ?? []);
  return (
    <TabScreen>
      <PageHeader title="Inbox" />
      {notifications === undefined ? (
        <CenteredSpinner label="Loading notifications" />
      ) : notifications.length === 0 ? (
        <EmptyState icon={IconInbox} title="No notifications" description="Mentions and agent questions show up here." />
      ) : (
        <ScrollView
          // Each day header sticks while its rows scroll, as the web `sticky top-0` header.
          stickyHeaderIndices={groups.map((_, index) => index * 2)}
          contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        >
          {groups.flatMap((group) => [
            <View
              key={`${group.label}-header`}
              className="px-4 py-1.5"
              style={{
                backgroundColor: tokens.color.background[scheme],
                borderBottomWidth: 1,
                borderBottomColor: tokens.color.border[scheme],
              }}
            >
              <SectionLabel>{group.label}</SectionLabel>
            </View>,
            <DividedList key={`${group.label}-rows`}>
              {group.items.map((notification) => (
                <NotificationRow
                  key={notification._id}
                  notification={notification}
                  repoLabel={notification.repoId ? repoLabels.get(notification.repoId) : undefined}
                  onPress={() => open(notification)}
                  onMarkRead={() => void markAsRead({ id: notification._id })}
                />
              ))}
            </DividedList>,
          ])}
        </ScrollView>
      )}
    </TabScreen>
  );
}
