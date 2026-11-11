import { api } from "@eva/backend";
import {
  QUICK_TASK_LIST_DEFAULTS,
  TASK_STATUS_LABELS,
  TASK_TAGS,
  applyQuickTaskFilters,
  clearedQuickTaskFilters,
  groupByTaskStatus,
  runAllPlan,
  startAll,
  type DisplayTaskStatus,
  type QuickTaskListFilters,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChecklist, IconChevronRight, IconPlayerPlay, IconPlus } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { Button, ConfirmDialog, EmptyState, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText, withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActiveFiltersBar, QuickTaskToolbar } from "@/quickTasks/QuickTaskListOptions";
import { QuickTaskRow } from "@/quickTasks/QuickTaskRow";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { RepoPicker, useRepoParam } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

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
 * picker, the toolbar (search and the Options sheet: sort and filters, the
 * web `QuickTasksToolbar`) and its "Filtered by" chips, then a collapsible
 * section per shown status (icon, label, count) in workflow order, each with
 * its task rows or "No tasks". To Do carries the web "Run" (Run All) when it
 * has tasks; a long press on a row opens the web row menu as a sheet
 * (`useQuickTaskActions`). It opens as the web does: tasks outside projects,
 * recently updated first (`QUICK_TASK_LIST_DEFAULTS`). A `SectionList`, as a
 * repo's tasks have no cap. The web kanban, select mode and its bulk bar,
 * drag between sections and "Import from Linear" are not here.
 */
export function QuickTasksSection() {
  const { repos, repo, setRepo } = useQuickTaskRepo();
  if (repos === undefined) return <QuickTaskPlaceholders />;
  if (!repo) {
    return <EmptyState icon={IconChecklist} title="No repos" description="Connect a repo on the web. It shows up here." />;
  }
  return (
    <View className="flex-1">
      <View className="px-4">
        <RepoPicker repos={repos} value={repo} onChange={setRepo} />
      </View>
      {/* Keyed on the repo: its search, filters and open sections start fresh, as a project id belongs to one repo. */}
      <QuickTaskList key={repo._id} repo={repo} />
    </View>
  );
}

function QuickTaskList({ repo }: { repo: Repo }) {
  const { openNew } = useQuickTaskRepo();
  const tasks = useQuery(api.agentTasks.getAllTasks, { repoId: repo._id });
  const errorTaskIds = useQuery(
    api.agentRuns.getTaskIdsWithLatestRunError,
    tasks ? { repoId: repo._id, taskIds: tasks.map((task) => task._id) } : "skip",
  );
  const users = useQuery(api.users.listAll, {});
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const currentUserId = useQuery(api.auth.me, {});
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [filters, setFilters] = useState<QuickTaskListFilters>(QUICK_TASK_LIST_DEFAULTS);
  const [closed, setClosed] = useState<ReadonlySet<DisplayTaskStatus>>(new Set());
  const [runAllOpen, setRunAllOpen] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const actions = useQuickTaskActions({ repo, users, projects });
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const scheme = useScheme();

  if (tasks === undefined) return <QuickTaskPlaceholders />;
  const changeFilters = (patch: Partial<QuickTaskListFilters>) => setFilters({ ...filters, ...patch });
  const shown = applyQuickTaskFilters(tasks, filters);
  // The web tag list: the stock tags and every tag on the repo's tasks. `sort` on a fresh array; Hermes lacks `toSorted`.
  const allTags = [...new Set([...TASK_TAGS, ...tasks.flatMap((task) => task.tags ?? [])])].sort();
  const sections = groupByTaskStatus(shown).filter((section) => filters.statuses.includes(section.status));
  const errors = new Set<string>(errorTaskIds ?? []);
  const todoCount = shown.filter((task) => task.status === "todo").length;
  const plan = runAllPlan(shown, currentUserId);
  const toggle = (status: DisplayTaskStatus) => {
    const next = new Set(closed);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setClosed(next);
  };
  const runAll = async () => {
    setRunningAll(true);
    const failed = await startAll(plan.owned, (task) => startExecution({ id: task._id }));
    if (failed > 0) toast.error(`Could not start ${failed} of ${plan.owned.length} tasks.`);
    setRunningAll(false);
  };

  if (tasks.length === 0) {
    return (
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
    );
  }

  return (
    <View className="flex-1">
      <QuickTaskToolbar filters={filters} onChange={changeFilters} projects={projects} users={users} allTags={allTags} />
      <ActiveFiltersBar filters={filters} onChange={changeFilters} projects={projects} users={users} />
      {shown.length === 0 ? (
        <EmptyState
          icon={IconChecklist}
          title="No matching quick tasks"
          description="Try clearing filters to see all tasks."
          action={
            <Button
              size="sm"
              fullWidth={false}
              leftIcon={<IconPlus size={16} color={EVA_THEME[scheme].primaryForeground} />}
              onPress={() => changeFilters(clearedQuickTaskFilters())}
            >
              Clear filters
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
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <StatusHeader
              status={section.status}
              count={section.count}
              open={section.open}
              onToggle={() => toggle(section.status)}
              onRunAll={section.status === "todo" && todoCount > 0 ? () => setRunAllOpen(true) : undefined}
              runningAll={runningAll}
            />
          )}
          // 8 between cards (web `space-y-1.5`, 6), so each reads as its own target.
          ItemSeparatorComponent={RowGap}
          renderItem={({ item: task, section }) => (
            <QuickTaskRow
              task={task}
              status={section.status}
              hasError={errors.has(task._id)}
              creator={users?.find((user) => user._id === task.createdBy)}
              onLongPress={() => actions.openSheet(task)}
            />
          )}
          renderSectionFooter={({ section }) => <StatusFooter open={section.open} count={section.count} />}
          // Web: the list `p-3 pt-0`.
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
      {actions.dialogs}
      <RunAllDialog
        open={runAllOpen}
        onOpenChange={setRunAllOpen}
        ownedCount={plan.owned.length}
        skippedCount={plan.skippedCount}
        onConfirm={() => void runAll()}
      />
    </View>
  );
}

/** While the tasks load: cards shaped as `QuickTaskRow` (title over tags and age), 8 apart, on the list's `px-3`. */
function QuickTaskPlaceholders() {
  const card = EVA_THEME[useScheme()].card;
  return (
    <SkeletonList
      label="Loading quick tasks"
      divided={false}
      className="px-3"
      renderRow={(row) => (
        <View className="mb-2 rounded-lg" style={{ backgroundColor: card }}>
          <SkeletonRow index={row} lines={2} trailing={false} minHeight={72} className="px-3" />
        </View>
      )}
    />
  );
}

/** The web `RunAllDialog`: what Run All does, who it skips, then Cancel and Run All. */
function RunAllDialog({
  open,
  onOpenChange,
  ownedCount,
  skippedCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownedCount: number;
  skippedCount: number;
  onConfirm: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const plural = (count: number) => (count === 1 ? "" : "s");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Run All Tasks"
      description={
        ownedCount > 0 ? (
          <>
            {`Eva will run and complete ${ownedCount} task${plural(ownedCount)} you created.`}
            {skippedCount > 0 ? (
              <Text style={{ color: theme.warning }}>
                {`\n\n${skippedCount} task${plural(skippedCount)} created by others will be skipped. Only the task owner can run Eva.`}
              </Text>
            ) : null}
            {"\n\nIf there is an issue, Eva will return the task to To Do with a red border.\n\nIf successful, she will move it to Code Review."}
          </>
        ) : (
          "Only the task owner can run Eva. None of the todo tasks were created by you."
        )
      }
      confirmLabel="Run All"
      confirmDisabled={ownedCount === 0}
      onConfirm={onConfirm}
    />
  );
}

/**
 * One web status section's header: a 48 high button (chevron that turns open,
 * the 16 status icon and 14 label in its colour, the count at 60% muted), so
 * it reads as a heading above the 72-high cards. Its rows follow 8 apart,
 * then `StatusFooter`.
 */
function StatusHeader({
  status,
  count,
  open,
  onToggle,
  onRunAll,
  runningAll,
}: {
  status: DisplayTaskStatus;
  count: number;
  open: boolean;
  onToggle: () => void;
  /** To Do's web "Run All" button ("Run" below `sm`), shown while it has tasks. */
  onRunAll?: () => void;
  runningAll: boolean;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const { icon: Icon, text } = statusAppearance(status, scheme);
  const label = TASK_STATUS_LABELS[status];
  return (
    <View className="flex-row items-center">
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "task" : "tasks"}`}
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      className="min-h-12 flex-1 flex-row items-center gap-2 rounded-lg px-2 active:opacity-70"
    >
      <View style={open ? { transform: [{ rotate: "90deg" }] } : undefined}>
        <IconChevronRight size={16} color={muted} />
      </View>
      <Icon size={16} color={text} />
      <Text className="font-instrument-sans-medium text-sm" style={{ color: text, fontWeight: "500" }}>
        {label}
      </Text>
      <Text className="font-instrument-sans text-xs" style={{ color: withAlpha(muted, 0.6), fontVariant: ["tabular-nums"] }}>
        {count}
      </Text>
    </Pressable>
      {onRunAll ? (
        // Web: a `sm` primary button, 36 high, `mr-2`, a 14 play icon (a spinner while starting).
        <Button
          size="sm"
          fullWidth={false}
          accessibilityLabel="Run All"
          loading={runningAll}
          disabled={runningAll}
          leftIcon={<IconPlayerPlay size={14} color={EVA_THEME[scheme].primaryForeground} />}
          onPress={onRunAll}
          className="mr-2 self-center"
        >
          Run
        </Button>
      ) : null}
    </View>
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

/** The 8 between two task cards. */
function RowGap() {
  return <View className="h-2" />;
}
