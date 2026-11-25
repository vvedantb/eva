import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { groupNeedsYou, needsYouSourceLabel } from "@eva/shared/needsYou";
import { IconInbox } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { SectionLabel } from "@vvedantb/native-ui/layout";
import { Badge, Button, EmptyState, ListDivider, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { Pressable, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openAppLink } from "@/push/openLink";
import { timeAgo } from "@/ui/format";
import { LIST_WINDOW } from "@/ui/listWindow";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type NeedsYouRow = FunctionReturnType<typeof api.needsYou.list>[number];

/**
 * The web `NeedsYouList` at phone width: questions, PRs to review, Triage and
 * failed runs, grouped in that order (`@eva/shared/needsYou`), sticky group
 * headers with counts. A row opens its chat; its one button acts in place.
 * No read state: a row leaves once someone acts on it.
 */
export function NeedsYouList({ rows }: { rows: NeedsYouRow[] | undefined }) {
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  if (rows === undefined) {
    return (
      <SkeletonList
        label="Loading inbox"
        count={8}
        renderRow={(row) => <SkeletonRow index={row} lines={2} minHeight={64} />}
      />
    );
  }
  if (rows.length === 0) return <EmptyState icon={IconInbox} title="Nothing needs you" />;
  return (
    <SectionList
      sections={groupNeedsYou(rows).map((section) => ({
        label: `${section.label} ${section.rows.length}`,
        data: section.rows,
      }))}
      keyExtractor={(row) => row.key}
      stickySectionHeadersEnabled
      {...LIST_WINDOW}
      renderSectionHeader={({ section }) => (
        <View
          className="px-4 py-1.5"
          style={{
            backgroundColor: EVA_THEME[scheme].background,
            borderBottomWidth: 1,
            borderBottomColor: EVA_THEME[scheme].border,
          }}
        >
          <SectionLabel style={{ letterSpacing: XS_TRACKING, lineHeight: 24 }}>{section.label}</SectionLabel>
        </View>
      )}
      ItemSeparatorComponent={ListDivider}
      renderItem={({ item }) => <NeedsYouRowItem row={item} />}
      contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}
    />
  );
}

/** One row, as the web: title over the source chip and context, the action, the age. */
function NeedsYouRowItem({ row }: { row: NeedsYouRow }) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const open = () => openAppLink({ chatTarget: row.chatTarget, href: row.href, repoId: row.repoId });
  return (
    <View className="flex-row items-center gap-3 px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={row.title}
        onPress={open}
        className="min-w-0 flex-1 py-3 active:opacity-70"
      >
        <Text
          numberOfLines={1}
          className="font-instrument-sans-medium text-sm"
          style={{ color: EVA_THEME[scheme].foreground, fontWeight: "500" }}
        >
          {row.title}
        </Text>
        <View className="min-w-0 flex-row items-center gap-1.5">
          <Badge variant="secondary" textClassName="text-xs">
            {needsYouSourceLabel(row)}
          </Badge>
          {row.detail ? (
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 font-instrument-sans text-xs leading-relaxed"
              style={{ color: muted, letterSpacing: XS_TRACKING }}
            >
              {row.detail}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <NeedsYouAction row={row} onReply={open} />
      <Text
        className="font-instrument-sans text-xs"
        style={{ color: muted, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
      >
        {timeAgo(row.at)}
      </Text>
    </View>
  );
}

/** The web row action, by group: Reply, Open PR, Reject + Approve, Retry. */
function NeedsYouAction({ row, onReply }: { row: NeedsYouRow; onReply: () => void }) {
  const approve = useMutation(api.buildWorkflow.approveProjectTasks);
  const remove = useMutation(api.agentTasks.remove);
  const retry = useMutation(api.agentTasks.startExecution);
  if (row.group === "question") {
    return (
      <Button size="sm" variant="outline" fullWidth={false} onPress={onReply}>
        Reply
      </Button>
    );
  }
  if (row.group === "review") {
    const { prUrl } = row;
    return prUrl ? (
      <Button size="sm" fullWidth={false} onPress={() => void WebBrowser.openBrowserAsync(prUrl)}>
        Open PR
      </Button>
    ) : null;
  }
  const { taskId, projectId } = row;
  if (taskId === undefined) return null;
  if (row.group === "triage") {
    return (
      <View className="flex-row gap-1.5">
        <Button
          size="sm"
          variant="outline"
          fullWidth={false}
          onPress={() => remove({ id: taskId }).catch(() => toast.error("Couldn't reject the task", { id: "needs-you-reject" }))}
        >
          Reject
        </Button>
        {projectId !== undefined ? (
          <Button
            size="sm"
            fullWidth={false}
            onPress={() =>
              approve({ projectId, taskIds: [taskId] }).catch(() =>
                toast.error("Couldn't approve the task", { id: "needs-you-approve" }),
              )
            }
          >
            Approve
          </Button>
        ) : null}
      </View>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      fullWidth={false}
      onPress={() => retry({ id: taskId }).catch(() => toast.error("Couldn't retry the task", { id: "needs-you-retry" }))}
    >
      Retry
    </Button>
  );
}
