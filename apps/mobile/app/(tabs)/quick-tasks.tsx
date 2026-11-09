import { api } from "@eva/backend";
import { IconChecklist, IconPlus } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { PageHeader } from "@vvedantb/native-ui/layout";
import { Checkbox, CenteredSpinner, EmptyState, IconButton, Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import { tokens, useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseQuickTaskTab, taskStatusTone, type QuickTaskTab } from "@/tasks/quickTasks";
import { timeAgo } from "@/ui/format";
import { RowStatus } from "@/ui/RowStatus";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

/**
 * Quick tasks across every repo the user can access, in list view only (the
 * web board is out of scope on a phone). Active and Done tabs, one group per
 * repo, rows with status, title and time. The row checkbox completes a task.
 */
export default function QuickTasksScreen() {
  const [tab, setTab] = useState<QuickTaskTab>("active");
  const tasks = useQuery(api.mobile.listQuickTasks, { closed: tab === "done" });
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  const router = useRouter();
  const scheme = useScheme();
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const muted = tokens.color.muted[scheme];

  const groups = new Map<string, NonNullable<typeof tasks>>();
  for (const task of tasks ?? []) {
    groups.set(task.repoLabel, [...(groups.get(task.repoLabel) ?? []), task]);
  }

  const complete = async (id: NonNullable<typeof tasks>[number]["taskId"]) => {
    try {
      await updateStatus({ id, status: "done" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't complete task");
    }
  };

  return (
    <TabScreen>
      <PageHeader
        title="Quick tasks"
        action={<IconButton icon={IconPlus} label="New quick task" size="sm" onPress={() => router.push("/task/new")} />}
      />
      <View className="px-4 pb-2">
        <Tabs value={tab} onValueChange={(value: string) => setTab(parseQuickTaskTab(value))}>
          <TabsList variant="segmented" className="self-stretch">
            <TabsTrigger value="active" className="flex-1">
              Active
            </TabsTrigger>
            <TabsTrigger value="done" className="flex-1">
              Done
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </View>
      {tasks === undefined ? (
        <CenteredSpinner label="Loading quick tasks" />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={IconChecklist}
          title={tab === "done" ? "No finished quick tasks" : "No quick tasks"}
          description={tab === "done" ? undefined : "Tap + to create one."}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarReserve(largerText, insets.bottom) }}>
          {[...groups].map(([repoLabel, rows]) => (
            <View key={repoLabel} className="pb-2">
              <View className="flex-row items-center gap-2 px-4 py-2">
                <View
                  className="h-[18px] w-[18px] items-center justify-center rounded"
                  style={{ backgroundColor: tokens.color.surfaceSecondary[scheme] }}
                >
                  <Text className="font-instrument-sans-semibold" style={{ fontSize: 10, color: muted, fontWeight: "600" }}>
                    {repoLabel.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="font-instrument-sans-medium text-xs" style={{ color: muted, fontWeight: "500" }}>
                  {repoLabel}
                </Text>
              </View>
              {rows.map((task) => (
                <View key={task.taskId} className="min-h-11 flex-row items-center gap-2 px-4">
                  {tab === "active" ? (
                    <Checkbox checked={false} accessibilityLabel={`Mark done: ${task.title}`} onCheckedChange={() => void complete(task.taskId)} />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={task.title}
                    onPress={() => router.push({ pathname: "/chat/[target]", params: { target: task.taskId } })}
                    className="min-h-11 flex-1 flex-row items-center gap-2 active:opacity-70"
                  >
                    <RowStatus awaitingAnswer={task.isAwaitingAnswer} tone={taskStatusTone(task.status)} />
                    <Text numberOfLines={1} className="font-instrument-sans flex-1 text-sm" style={{ color: tokens.color.foreground[scheme] }}>
                      {task.title}
                    </Text>
                    <Text className="font-instrument-sans text-xs" style={{ color: muted, fontVariant: ["tabular-nums"] }}>
                      {timeAgo(task.updatedAt)}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </TabScreen>
  );
}
