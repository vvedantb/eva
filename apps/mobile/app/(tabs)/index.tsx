import { api, type Doc, type Id } from "@eva/backend";
import { getNotificationAppearance } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { groupNotifications, type InboxGroup } from "@eva/shared/notificationGroups";
import { IconArchive, IconArchiveOff, IconInbox, IconMail, IconMailOpened, IconX } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { impactHaptic } from "@vvedantb/native-ui/haptics";
import { PageHeader, SectionLabel } from "@vvedantb/native-ui/layout";
import {
  BulkActionBar,
  closeSwipeRows,
  EmptyState,
  HeaderIconButton,
  ListDivider,
  SkeletonList,
  SkeletonRow,
} from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
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
 *
 * Select mode is Android's contextual action bar: it starts from the header
 * Select button or a long press on a row, the header shows "N selected" with
 * a close X, and the bulk bar takes the tab bar's place (the tab bar hides,
 * so no tab switch mid-selection). Back, either X, a filter change or a bulk
 * action leaves it.
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

  // Android back leaves select mode first, as it closes a sheet first. An
  // effect because the hardware back button is a subscription outside React.
  // It comes before the values below: the React Compiler memoises nothing
  // across a hook call, and the list and its rows are memoised only when no
  // hook sits between the queries and the JSX.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelecting(false);
      setSelected(new Set());
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);
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
  /** Select mode from a long press: that row ticked, and a light tap to say the mode changed. */
  const startSelect = ({ _id: id }: Doc<"notifications">) => {
    closeSwipeRows();
    impactHaptic("light");
    setSelecting(true);
    setSelected(new Set([id]));
  };
  const toggle = ({ _id: id }: Doc<"notifications">) => {
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
  const markRead = (notification: Doc<"notifications">) => void markAsRead({ id: notification._id });
  const toggleArchive = (notification: Doc<"notifications">) =>
    notification.archivedAt === undefined ? archive([notification._id]) : unarchive([notification._id]);
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
      {/* The bulk bar stands in for the tab bar (`FloatingTabBar` hides on `display: "none"`). */}
      <Tabs.Screen options={{ tabBarStyle: selecting ? { display: "none" } : undefined }} />
      {selecting ? (
        // Android's contextual action bar: the count in place of the title, a
        // close X before it, and no page actions (the bulk bar holds them).
        <PageHeader
          title={`${selected.size} selected`}
          leading={
            <HeaderIconButton label="Cancel selection" onPress={exitSelect}>
              <IconX size={18} color={EVA_THEME[scheme].foreground} />
            </HeaderIconButton>
          }
        />
      ) : (
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
              onSelect={() => {
                closeSwipeRows();
                setSelecting(true);
              }}
            />
          }
        />
      )}
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
                backgroundColor: EVA_THEME[scheme].background,
                borderBottomWidth: 1,
                borderBottomColor: EVA_THEME[scheme].border,
              }}
            >
              {/* The web label is an inline `text-xs` span in a 24 line box. */}
              <SectionLabel style={{ letterSpacing: XS_TRACKING, lineHeight: 24 }}>{section.label}</SectionLabel>
            </View>
          )}
          // The `DividedList` hairline between the rows of a group.
          ItemSeparatorComponent={ListDivider}
          // The same handlers for every row (each row closes over its own notification), so a
          // row whose notification did not change keeps its drawing when the list draws more.
          renderItem={({ item: notification }) => (
            <NotificationRow
              notification={notification}
              repo={repoOf(notification)}
              onOpen={open}
              onMarkRead={markRead}
              onToggleRead={toggleRead}
              onToggleArchive={toggleArchive}
              onStartSelect={startSelect}
              selection={selecting ? { checked: selected.has(notification._id), onToggle: toggle } : undefined}
            />
          )}
          // A scroll closes a row swiped open.
          onScrollBeginDrag={closeSwipeRows}
          // The bulk bar takes the tab bar's slot and height, so one reserve clears either.
          contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
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
        placement="tabBar"
        // The web `InboxBulkBar` actions and names; Archive is reversible, so not destructive.
        // The web bar is icon-only at phone width, so the labels under the icons are
        // shortened to fit five controls in 390: "Mark unread" would not.
        primaryActions={[
          {
            key: "read",
            label: "Mark read",
            shortLabel: "Read",
            icon: IconMailOpened,
            onClick: bulk((ids) => markManyAsRead({ ids })),
          },
          {
            key: "unread",
            label: "Mark unread",
            shortLabel: "Unread",
            icon: IconMail,
            onClick: bulk((ids) => markManyAsUnread({ ids })),
          },
          filter === "archived"
            ? { key: "unarchive", label: "Unarchive", icon: IconArchiveOff, onClick: bulk(unarchive) }
            : { key: "archive", label: "Archive", icon: IconArchive, onClick: bulk(archive) },
        ]}
      />
    </TabScreen>
  );
}
