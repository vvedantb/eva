import { api } from "@eva/backend";
import { TASK_STATUS_LABELS, defaultQuickTaskSections, type DisplayTaskStatus } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChecklist, IconChevronRight, IconPlus } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { Button, CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { useLargerText, withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QuickTaskRow } from "@/quickTasks/QuickTaskRow";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { RepoPicker, useRepoParam } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

/** The Quick Tasks repo (`useRepoParam`), and the new-task screen on it. */
export function useQuickTaskRepo() {
  const router = useRouter();
  const { repos, repo, setRepo } = useRepoParam();
  return {
    repos,
    repo,
    setRepo,
    /** The new-task screen, on this repo. */
    openNew: () =>
      router.push(repo ? { pathname: "/quick-task/new", params: { repoId: repo._id } } : "/quick-task/new"),
  };
}

/**
 * The web Quick Tasks list view at phone width, for one repo: the repo
 * picker, then a collapsible section per status (icon, label, count) in
 * workflow order, each with its task rows or "No tasks". It shows what the
 * web opens with and no filters set: tasks outside projects, recently
 * updated first (`defaultQuickTaskSections`). A `SectionList`, as a repo's
 * tasks have no cap. The web search, filters, sort, kanban, select mode, drag
 * between sections and "Run All" are not here.
 */
export function QuickTasksSection() {
  const { repos, repo, setRepo, openNew } = useQuickTaskRepo();
  const tasks = useQuery(api.agentTasks.getAllTasks, repo ? { repoId: repo._id } : "skip");
  const errorTaskIds = useQuery(
    api.agentRuns.getTaskIdsWithLatestRunError,
    repo && tasks ? { repoId: repo._id, taskIds: tasks.map((task) => task._id) } : "skip",
  );
  const users = useQuery(api.users.listAll, {});
  const [closed, setClosed] = useState<ReadonlySet<DisplayTaskStatus>>(new Set());
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const scheme = useScheme();

  if (repos === undefined || (repo && tasks === undefined)) return <CenteredSpinner label="Loading quick tasks" />;
  if (!repo) {
    return <EmptyState icon={IconChecklist} title="No repos" description="Connect a repo on the web. It shows up here." />;
  }
  const sections = defaultQuickTaskSections(tasks ?? []);
  const errors = new Set<string>(errorTaskIds ?? []);
  const toggle = (status: DisplayTaskStatus) => {
    const next = new Set(closed);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setClosed(next);
  };

  return (
    <View className="flex-1">
      <View className="px-4">
        <RepoPicker repos={repos} value={repo} onChange={setRepo} />
      </View>
      {sections.every((section) => section.tasks.length === 0) ? (
        <EmptyState
          icon={IconChecklist}
          title="No quick tasks"
          description="Quick tasks are standalone tasks not tied to a feature. Create one for small, one-off work."
          action={
            <Button
              size="sm"
              fullWidth={false}
              leftIcon={<IconPlus size={16} color={EVA_THEME[scheme].primaryForeground} />}
              onPress={openNew}
            >
              Create Quick Task
            </Button>
          }
        />
      ) : (
        <SectionList
          sections={sections.map((section) => {
            const open = !closed.has(section.status);
            return { status: section.status, count: section.tasks.length, open, data: open ? section.tasks : [] };
          })}
          keyExtractor={(task) => task._id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <StatusHeader
              status={section.status}
              count={section.count}
              open={section.open}
              onToggle={() => toggle(section.status)}
            />
          )}
          // Web: the rows `space-y-1.5`.
          ItemSeparatorComponent={RowGap}
          renderItem={({ item: task, section }) => (
            <QuickTaskRow
              task={task}
              status={section.status}
              hasError={errors.has(task._id)}
              creator={users?.find((user) => user._id === task.createdBy)}
            />
          )}
          renderSectionFooter={({ section }) => <StatusFooter open={section.open} count={section.count} />}
          // Web: the list `p-3 pt-0`.
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
    </View>
  );
}

/**
 * One web status section's header: a 44 high button (chevron that turns open,
 * the status icon and label in its colour, the count at 60% muted). Its rows
 * follow 6 apart, then `StatusFooter`.
 */
function StatusHeader({
  status,
  count,
  open,
  onToggle,
}: {
  status: DisplayTaskStatus;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const { icon: Icon, text } = statusAppearance(status, scheme);
  const label = TASK_STATUS_LABELS[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "task" : "tasks"}`}
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      className="min-h-11 flex-row items-center gap-2 rounded-lg px-2 active:opacity-70"
    >
      <View style={open ? { transform: [{ rotate: "90deg" }] } : undefined}>
        <IconChevronRight size={14} color={muted} />
      </View>
      <Icon size={14} color={text} />
      <Text className="font-instrument-sans-medium text-sm" style={{ color: text, fontWeight: "500" }}>
        {label}
      </Text>
      <Text className="font-instrument-sans text-xs" style={{ color: withAlpha(muted, 0.6), fontVariant: ["tabular-nums"] }}>
        {count}
      </Text>
    </Pressable>
  );
}

/** Under a section: "No tasks" when it is open and empty, the rows' `pb-1.5` when it has rows, then the web `space-y-1` to the next section. */
function StatusFooter({ open, count }: { open: boolean; count: number }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  if (open && count === 0) {
    return (
      <Text className="font-instrument-sans mb-1 py-4 text-center text-xs" style={{ color: muted }}>
        No tasks
      </Text>
    );
  }
  return <View className={open ? "mb-1 pb-1.5" : "mb-1"} />;
}

/** The 6 between two task rows. */
function RowGap() {
  return <View className="h-1.5" />;
}
