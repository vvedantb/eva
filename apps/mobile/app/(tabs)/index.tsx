import { api, type Doc, type Id } from "@eva/backend";
import { getNotificationAppearance } from "@eva/shared";
import { groupNotifications, type InboxGroup } from "@eva/shared/notificationGroups";
import { IconArchive, IconArchiveOff, IconInbox, IconMail, IconMailOpened } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader, SectionLabel } from "@vvedantb/native-ui/layout";
import {
  BulkActionBar,
  closeSwipeRows,
  EmptyState,
  ListDivider,
  SkeletonList,
  SkeletonRow,
} from "@vvedantb/native-ui/primitives";
import { tokens, useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Linking, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_URL } from "@/config";
import { InboxHeaderActions, type InboxFilter } from "@/inbox/InboxHeaderActions";
import { NotificationRow, type NotificationRepo } from "@/inbox/NotificationRow";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme, XS_TRACKING } from "@/ui/theme";

/**
 * The web inbox at phone width: All / Unread / Archived, grouped by day,
 * repo, type or urgency (`@eva/shared/notificationGroups`), sticky group
 * headers, and select mode with the web bulk bar. The web row menu is a
 * swipe on each row (`NotificationRow`). A `SectionList`: the inbox holds up
 * to 100 rows, and only those near the view are drawn.
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
  const markAsUnread = useMutation(api.notifications.markAsUnread);
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
  // Android back leaves select mode first, as it closes a sheet first. An
  // effect because the hardware back button is a subscription outside React.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelecting(false);
      setSelected(new Set());
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);
  const toggle = (id: Id<"notifications">) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const bulk = (run: (ids: Id<"notifications">[]) => Promise<unknown>) => () => {
    void run([...selected]);
    exitSelect();
  };
  // The web `useInboxActions` writes and toasts. Archive offers Undo at once,
  // as the rows have already left the list.
  const unarchive = (ids: Id<"notifications">[]) => {
    const done = unarchiveMany({ ids });
    done.catch(() => toast.error("Couldn't unarchive", { id: "inbox-unarchive" }));
    return done;
  };
  const archive = (ids: Id<"notifications">[]) => {
    const done = archiveMany({ ids });
    done.catch(() => toast.error("Couldn't archive", { id: "inbox-archive" }));
    toast.success(`${ids.length} archived`, { action: { label: "Undo", onPress: () => void unarchive(ids) } });
    return done;
  };
  const toggleRead = (notification: Doc<"notifications">) => {
    const id = notification._id;
    if (notification.read) {
      markAsUnread({ id }).catch(() => toast.error("Couldn't mark as unread", { id: "inbox-mark-unread" }));
    } else {
      markAsRead({ id }).catch(() => toast.error("Couldn't mark as read", { id: "inbox-mark-read" }));
    }
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
            onToggleSelecting={() => {
              closeSwipeRows();
              if (selecting) exitSelect();
              else setSelecting(true);
            }}
          />
        }
      />
      {notifications === undefined ? (
        // Rows shaped as `NotificationRow`: the 28 mark, subject over event line, the time.
        <SkeletonList
          label="Loading notifications"
          count={8}
          renderRow={(row) => <SkeletonRow index={row} leading={28} lines={2} minHeight={64} />}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={IconInbox}
          title={filter === "all" ? "No notifications" : `No ${filter} notifications`}
          description={filter === "all" ? "Mentions and agent questions show up here." : undefined}
        />
      ) : (
        <SectionList
          sections={groups.map((section) => ({ label: section.label, data: section.items }))}
          keyExtractor={(notification) => notification._id}
          // Each group header sticks while its rows scroll, as the web `sticky top-0` header.
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View
              className="px-4 py-1.5"
              style={{
                backgroundColor: tokens.color.background[scheme],
                borderBottomWidth: 1,
                borderBottomColor: tokens.color.border[scheme],
              }}
            >
              {/* The web label is an inline `text-xs` span in a 24 line box. */}
              <SectionLabel style={{ letterSpacing: XS_TRACKING, lineHeight: 24 }}>{section.label}</SectionLabel>
            </View>
          )}
          // The `DividedList` hairline between the rows of a group.
          ItemSeparatorComponent={ListDivider}
          renderItem={({ item: notification }) => (
            <NotificationRow
              notification={notification}
              repo={repoOf(notification)}
              onPress={() => open(notification)}
              onMarkRead={() => void markAsRead({ id: notification._id })}
              onToggleRead={() => toggleRead(notification)}
              onToggleArchive={() =>
                notification.archivedAt === undefined ? archive([notification._id]) : unarchive([notification._id])
              }
              selection={
                selecting
                  ? { checked: selected.has(notification._id), onToggle: () => toggle(notification._id) }
                  : undefined
              }
            />
          )}
          // A scroll closes a row swiped open.
          onScrollBeginDrag={closeSwipeRows}
          contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) + (selecting ? 72 : 0) }}
        />
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
        // At 390 the bar is wider than the screen: Cancel stays in view, the rest scrolls.
        pinCancel
        // The web `InboxBulkBar` actions; Archive is reversible, so not destructive.
        primaryActions={[
          { key: "read", label: "Mark read", icon: IconMailOpened, onClick: bulk((ids) => markManyAsRead({ ids })) },
          { key: "unread", label: "Mark unread", icon: IconMail, onClick: bulk((ids) => markManyAsUnread({ ids })) },
          filter === "archived"
            ? { key: "unarchive", label: "Unarchive", icon: IconArchiveOff, onClick: bulk(unarchive) }
            : { key: "archive", label: "Archive", icon: IconArchive, onClick: bulk(archive) },
        ]}
      />
    </TabScreen>
  );
}
