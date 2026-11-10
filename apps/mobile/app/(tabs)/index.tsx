import { api, type Doc, type Id } from "@eva/backend";
import { getNotificationAppearance } from "@eva/shared";
import { groupNotifications, type InboxGroup } from "@eva/shared/notificationGroups";
import { IconArchive, IconArchiveOff, IconInbox, IconMail, IconMailOpened } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader, SectionLabel } from "@vvedantb/native-ui/layout";
import { BulkActionBar, CenteredSpinner, DividedList, EmptyState } from "@vvedantb/native-ui/primitives";
import { tokens, useLargerText } from "@vvedantb/native-ui/theme";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_URL } from "@/config";
import { InboxHeaderActions, type InboxFilter } from "@/inbox/InboxHeaderActions";
import { NotificationRow, type NotificationRepo } from "@/inbox/NotificationRow";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme, XS_TRACKING } from "@/ui/theme";

/**
 * The web inbox at phone width: All / Unread / Archived, grouped by day,
 * repo, type or urgency (`@eva/shared/notificationGroups`), sticky group
 * headers, and select mode with the web bulk bar.
 */
export default function InboxScreen() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [group, setGroup] = useState<InboxGroup>("day");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<Id<"notifications">>>(new Set());
  const listed = useQuery(api.notifications.list, { archived: filter === "archived" });
  const unreadCount = useQuery(api.notifications.countUnread, {}) ?? 0;
  const repos = useQuery(api.githubRepos.list, {});
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const markManyAsRead = useMutation(api.notifications.markManyAsRead);
  const markManyAsUnread = useMutation(api.notifications.markManyAsUnread);
  const archiveMany = useMutation(api.notifications.archiveMany);
  const unarchiveMany = useMutation(api.notifications.unarchiveMany);
  const router = useRouter();
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();

  // The web Unread filter: the inbox list, unread rows only.
  const notifications = filter === "unread" ? listed?.filter((notification) => !notification.read) : listed;
  const repoById = new Map<Id<"githubRepos">, NotificationRepo>(
    (repos ?? []).map((repo) => [repo._id, { label: repo.label ?? repo.name, logoUrl: repo.logoUrl }]),
  );
  const repoOf = (notification: Doc<"notifications">) =>
    notification.repoId ? repoById.get(notification.repoId) : undefined;
  const groups = groupNotifications(notifications ?? [], group, {
    typeLabel: (notification) => getNotificationAppearance(notification).label,
    repoLabel: (notification) => repoOf(notification)?.label,
  });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: Id<"notifications">) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const bulk = (run: (args: { ids: Id<"notifications">[] }) => Promise<null>) => () => {
    void run({ ids: [...selected] });
    exitSelect();
  };
  const open = (notification: Doc<"notifications">) => {
    if (!notification.read) void markAsRead({ id: notification._id });
    if (notification.chatTarget) {
      router.push({ pathname: "/chat/[target]", params: { target: notification.chatTarget } });
    } else if (notification.href) {
      // Docs, comments and older rows have no chat: open them on the web.
      void Linking.openURL(`${WEB_URL}${notification.href}`);
    }
  };

  return (
    <TabScreen>
      <PageHeader
        title="Inbox"
        action={
          <InboxHeaderActions
            filter={filter}
            onFilterChange={(next) => {
              setFilter(next);
              exitSelect();
            }}
            group={group}
            onGroupChange={setGroup}
            unreadCount={unreadCount}
            onMarkAllRead={() => void markAllAsRead({})}
            selecting={selecting}
            onToggleSelecting={() => (selecting ? exitSelect() : setSelecting(true))}
          />
        }
      />
      {notifications === undefined ? (
        <CenteredSpinner label="Loading notifications" />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={IconInbox}
          title={filter === "all" ? "No notifications" : `No ${filter} notifications`}
          description={filter === "all" ? "Mentions and agent questions show up here." : undefined}
        />
      ) : (
        <ScrollView
          // Each group header sticks while its rows scroll, as the web `sticky top-0` header.
          stickyHeaderIndices={groups.map((_, index) => index * 2)}
          contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) + (selecting ? 72 : 0) }}
        >
          {groups.flatMap((section) => [
            <View
              key={`${section.label}-header`}
              className="px-4 py-1.5"
              style={{
                backgroundColor: tokens.color.background[scheme],
                borderBottomWidth: 1,
                borderBottomColor: tokens.color.border[scheme],
              }}
            >
              {/* The web label is an inline `text-xs` span in a 24 line box. */}
              <SectionLabel style={{ letterSpacing: XS_TRACKING, lineHeight: 24 }}>{section.label}</SectionLabel>
            </View>,
            <DividedList key={`${section.label}-rows`}>
              {section.items.map((notification) => (
                <NotificationRow
                  key={notification._id}
                  notification={notification}
                  repo={repoOf(notification)}
                  onPress={() => open(notification)}
                  onMarkRead={() => void markAsRead({ id: notification._id })}
                  selection={
                    selecting
                      ? { checked: selected.has(notification._id), onToggle: () => toggle(notification._id) }
                      : undefined
                  }
                />
              ))}
            </DividedList>,
          ])}
        </ScrollView>
      )}
      <BulkActionBar
        barKey="inbox-bulk-bar"
        isSelecting={selecting}
        selectedCount={selected.size}
        totalCount={notifications?.length ?? 0}
        onExitSelect={exitSelect}
        onSelectAll={() => setSelected(new Set((notifications ?? []).map((notification) => notification._id)))}
        onClearSelection={() => setSelected(new Set())}
        bottomOffset={tabBarReserve(largerText, insets.bottom) - 24}
        // The web `InboxBulkBar` actions; Archive is reversible, so not destructive.
        primaryActions={[
          { key: "read", label: "Mark read", icon: IconMailOpened, onClick: bulk(markManyAsRead) },
          { key: "unread", label: "Mark unread", icon: IconMail, onClick: bulk(markManyAsUnread) },
          filter === "archived"
            ? { key: "unarchive", label: "Unarchive", icon: IconArchiveOff, onClick: bulk(unarchiveMany) }
            : { key: "archive", label: "Archive", icon: IconArchive, onClick: bulk(archiveMany) },
        ]}
      />
    </TabScreen>
  );
}
