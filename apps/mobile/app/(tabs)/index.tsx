import { api } from "@eva/backend";
import { IconInbox } from "@tabler/icons-react-native";
import { PageHeader, ScreenContainer } from "@vvedantb/native-ui/layout";
import { CenteredSpinner, EmptyState, ListRow, StatusDot } from "@vvedantb/native-ui/primitives";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { WEB_URL } from "@/config";
import { RowTime } from "@/ui/RowTime";
import { TabScreen } from "@/ui/TabScreen";

/** The web inbox (api.notifications.list), newest first. Tap opens the chat. */
export default function InboxScreen() {
  const notifications = useQuery(api.notifications.list, {});
  const markAsRead = useMutation(api.notifications.markAsRead);
  const router = useRouter();

  return (
    <TabScreen>
      <PageHeader title="Inbox" />
      {notifications === undefined ? (
        <CenteredSpinner label="Loading notifications" />
      ) : notifications.length === 0 ? (
        <EmptyState icon={IconInbox} title="No notifications" description="Mentions and agent questions show up here." />
      ) : (
        <ScreenContainer reserveTabBar>
          {notifications.map((notification) => (
            <ListRow
              key={notification._id}
              title={notification.title}
              meta={notification.contextLabel ?? notification.message}
              titleEnd={<RowTime at={notification.createdAt} />}
              leading={notification.read ? undefined : <StatusDot tone="info" size="md" />}
              onPress={() => {
                if (!notification.read) void markAsRead({ id: notification._id });
                if (notification.chatTarget) {
                  router.push({ pathname: "/chat/[target]", params: { target: notification.chatTarget } });
                } else if (notification.href) {
                  // Docs, comments and older rows have no chat: open them on the web.
                  void Linking.openURL(`${WEB_URL}${notification.href}`);
                }
              }}
            />
          ))}
        </ScreenContainer>
      )}
    </TabScreen>
  );
}
