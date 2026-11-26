import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { groupInboxRows, inboxDoneTarget } from "@eva/shared/inbox";
import { IconInbox } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader, SectionLabel } from "@vvedantb/native-ui/layout";
import { closeSwipeRows, EmptyState, ListDivider, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InboxRowItem, type InboxRow } from "@/inbox/InboxRowItem";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

/**
 * The web Inbox at phone width: one list, grouped by how urgent it is
 * (`@eva/shared/inbox`): Holding up work, Waiting on you, New since you
 * looked, with sticky labels and counts. A tap opens the chat; a swipe left
 * is Done, with Undo in the toast. A `SectionList`: only rows near the view
 * are drawn.
 */
export default function InboxScreen() {
  const rows = useQuery(api.inbox.list, {});
  const markDone = useMutation(api.inbox.markDone);
  const undoDone = useMutation(api.inbox.undoDone);
  const archiveMany = useMutation(api.notifications.archiveMany);
  const unarchiveMany = useMutation(api.notifications.unarchiveMany);
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();

  // The web `useInboxDone`: a chat leaves until something newer happens; a notification is archived.
  const done = async (row: InboxRow): Promise<void> => {
    const target = inboxDoneTarget(row);
    if (!target) return;
    if (target.kind === "chat") {
      const { chatId } = target;
      const marked = markDone({ chatId });
      marked.catch(() => toast.error("Couldn't mark as done", { id: "inbox-done" }));
      toast.success("Done", {
        action: {
          label: "Undo",
          onPress: () => void marked.then(({ previousDoneAt }) => undoDone({ chatId, previousDoneAt })),
        },
      });
      await marked;
      return;
    }
    const ids = [target.notificationId];
    const archived = archiveMany({ ids });
    archived.catch(() => toast.error("Couldn't mark as done", { id: "inbox-done" }));
    toast.success("Done", { action: { label: "Undo", onPress: () => void unarchiveMany({ ids }) } });
    await archived;
  };

  return (
    <TabScreen>
      <PageHeader title="Inbox" />
      {rows === undefined ? (
        <SkeletonList
          label="Loading inbox"
          count={8}
          renderRow={(row) => <SkeletonRow index={row} lines={2} minHeight={72} />}
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={IconInbox} title="Nothing new since you looked" />
      ) : (
        <SectionList
          sections={groupInboxRows(rows).map((section) => ({
            label: `${section.label} ${section.rows.length}`,
            data: section.rows,
          }))}
          keyExtractor={(row) => row.key}
          stickySectionHeadersEnabled
          {...LIST_WINDOW}
          renderSectionHeader={({ section }) => (
            <View className="px-4 py-1.5" style={{ backgroundColor: EVA_THEME[scheme].background }}>
              <SectionLabel style={{ letterSpacing: XS_TRACKING, lineHeight: 24 }}>{section.label}</SectionLabel>
            </View>
          )}
          ItemSeparatorComponent={ListDivider}
          renderItem={({ item }) => <InboxRowItem row={item} onDone={done} />}
          // A scroll closes a row swiped open.
          onScrollBeginDrag={closeSwipeRows}
          contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
    </TabScreen>
  );
}
