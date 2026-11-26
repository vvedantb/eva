import { api, type Id } from "@eva/backend";
import {
  ARCHIVE_LIST_MODES,
  ARCHIVE_LIST_MODE_LABELS,
  QUICK_TASK_LIST_DEFAULTS,
  TASK_STATUS_LABELS,
  TASK_TAGS,
  applyQuickTaskFilters,
  archiveCopy,
  clearedQuickTaskFilters,
  groupByTaskStatus,
  quickTaskTodoDrafts,
  runAllPlan,
  startAll,
  type ArchiveListMode,
  type DisplayTaskStatus,
  type QuickTaskListFilters,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChecklist, IconPlayerPlay, IconPlus } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { impactHaptic } from "@vvedantb/native-ui/haptics";
import { Button, ConfirmDialog, EmptyState, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect, useState } from "react";
import { BackHandler, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActiveFiltersBar, QuickTaskToolbar } from "@/quickTasks/QuickTaskListOptions";
import { QuickTaskBulkBar } from "@/quickTasks/QuickTaskBulk";
import type { QuickTaskDraft } from "@/quickTasks/DraftsMenu";
import { QuickTaskDraftRow, QuickTaskRow } from "@/quickTasks/QuickTaskRow";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { CardGap, FoldFooter, FoldHeader } from "@/ui/FoldHeader";
import { persistedIdSet } from "@/storage/persistedStore";
import { RepoPicker, useRepoParam } from "@/ui/RepoPicker";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

/** The status groups folded closed (To do, Done…), kept on the device. */
const closedQuickTaskStatuses = persistedIdSet("quickTaskStatusesClosed");

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type QuickTask = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
/** A To Do row is a task or one of the user's drafts; every other section holds tasks only. */
type ListItem = { kind: "draft"; draft: QuickTaskDraft } | { kind: "task"; task: QuickTask };

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
 * its task rows or "No tasks". To Do starts with the user's own drafts
 * (`QuickTaskDraftRow`, counted in its header): a tap opens the draft in the
 * new-task screen; drafts take no menu, select or Run All. To Do carries
 * the web "Run" (Run All) when it has tasks; a long press on a row opens the web row menu as a sheet
 * (`useQuickTaskActions`). It opens as the web does: the repo's quick tasks
 * (never a project's), recently updated first (`QUICK_TASK_LIST_DEFAULTS`). A `SectionList`, as a
 * repo's tasks have no cap. "Select" in a row's menu starts the web select
 * mode with its bulk bar (`QuickTaskBulkBar`). An Active / Archived switch,
 * as the sessions list, shows the archived tasks (`agentTasks.listArchived`)
 * instead, without drafts, Run All or select. The web kanban, drag between
 * sections and "Import from Linear" are not here.
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
      {/* Keyed on the repo: its search, filters and open sections start fresh. */}
      <QuickTaskList key={repo._id} repo={repo} />
    </View>
  );
}

/** The list query for each mode, as the sessions list. */
const QUICK_TASK_LIST_QUERIES = {
  active: api.agentTasks.getAllTasks,
  archived: api.agentTasks.listArchived,
};

const MODE_OPTIONS = ARCHIVE_LIST_MODES.map((value) => ({ value, label: ARCHIVE_LIST_MODE_LABELS[value] }));

function QuickTaskList({ repo }: { repo: Repo }) {
  // Not persisted: the list opens on Active each time, as the sessions list.
  const [mode, setMode] = useState<ArchiveListMode>("active");
  return (
    <View className="flex-1">
      <View className="px-4 pb-2">
        <SegmentedTabs value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </View>
      {/* Keyed on the mode: its search, filters, selection and open sections start fresh. */}
      <QuickTaskModeList key={mode} repo={repo} mode={mode} />
    </View>
  );
}

function QuickTaskModeList({ repo, mode }: { repo: Repo; mode: ArchiveListMode }) {
  const { openNew } = useQuickTaskRepo();
  const archived = mode === "archived";
  const tasks = useQuery(QUICK_TASK_LIST_QUERIES[mode], { repoId: repo._id });
  // The user's own drafts (private to them), at the top of To Do; never in Archived.
  const drafts = useQuery(api.agentTasks.listDrafts, archived ? "skip" : { repoId: repo._id });
  const errorTaskIds = useQuery(
    api.agentRuns.getTaskIdsWithLatestRunError,
    tasks ? { repoId: repo._id, taskIds: tasks.map((task) => task._id) } : "skip",
  );
  const draftMarks = useQuery(api.drafts.listMarks, { repoId: repo._id });
  const users = useQuery(api.users.listAll, {});
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const currentUserId = useQuery(api.auth.me, {});
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [filters, setFilters] = useState<QuickTaskListFilters>(QUICK_TASK_LIST_DEFAULTS);
  const [closed, toggle] = closedQuickTaskStatuses.useSet("all");
  const [runAllOpen, setRunAllOpen] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  // Select mode (the web bulk bar): from a row menu's "Select", that row ticked.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<Id<"agentTasks">>>(new Set());
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const actions = useQuickTaskActions({
    repo,
    users,
    projects,
    onSelect: archived
      ? undefined
      : (task) => {
          impactHaptic("light");
          setSelecting(true);
          setSelected(new Set([task._id]));
        },
  });
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();
  const scheme = useScheme();

  // Android back leaves select mode first, as it closes a sheet first. An effect:
  // the hardware back button is a subscription outside React.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelecting(false);
      setSelected(new Set());
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);

  if (tasks === undefined) return <QuickTaskPlaceholders />;
  const toggleSelected = (id: Id<"agentTasks">) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const changeFilters = (patch: Partial<QuickTaskListFilters>) => setFilters({ ...filters, ...patch });
  const shown = applyQuickTaskFilters(tasks, filters);
  const liveDrafts = drafts ?? [];
  const shownDrafts = quickTaskTodoDrafts(liveDrafts, filters);
  // The web tag list: the stock tags and every tag on the repo's tasks. `sort` on a fresh array; Hermes lacks `toSorted`.
  const allTags = [...new Set([...TASK_TAGS, ...tasks.flatMap((task) => task.tags ?? [])])].sort();
  const sections = groupByTaskStatus(shown).filter((section) => filters.statuses.includes(section.status));
  const errors = new Set<string>(errorTaskIds ?? []);
  const draftTaskIds = new Set<string>(draftMarks?.taskIds ?? []);
  const todoCount = shown.filter((task) => task.status === "todo").length;
  const plan = runAllPlan(shown, currentUserId);
  const runAll = async () => {
    setRunningAll(true);
    const failed = await startAll(plan.owned, (task) => startExecution({ id: task._id }));
    if (failed > 0) toast.error(`Could not start ${failed} of ${plan.owned.length} tasks.`);
    setRunningAll(false);
  };

  if (tasks.length === 0 && archived) {
    return <EmptyState icon={IconChecklist} title={archiveCopy("task").emptyArchived} />;
  }
  if (tasks.length === 0 && liveDrafts.length === 0) {
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
      <QuickTaskToolbar filters={filters} onChange={changeFilters} users={users} allTags={allTags} />
      <ActiveFiltersBar filters={filters} onChange={changeFilters} users={users} />
      {shown.length === 0 && shownDrafts.length === 0 ? (
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
          {...LIST_WINDOW}
          sections={sections.map((section) => {
            const open = !closed.has(section.status);
            const rows: ListItem[] = [
              ...(section.status === "todo" ? shownDrafts.map((draft): ListItem => ({ kind: "draft", draft })) : []),
              ...section.tasks.map((task): ListItem => ({ kind: "task", task })),
            ];
            return { status: section.status, count: rows.length, open, data: open ? rows : [] };
          })}
          keyExtractor={(item) => (item.kind === "draft" ? item.draft._id : item.task._id)}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <StatusHeader
              status={section.status}
              count={section.count}
              open={section.open}
              onToggle={() => toggle(section.status)}
              onRunAll={!archived && section.status === "todo" && todoCount > 0 ? () => setRunAllOpen(true) : undefined}
              runningAll={runningAll}
            />
          )}
          // 8 between cards (web `space-y-1.5`, 6), so each reads as its own target.
          ItemSeparatorComponent={CardGap}
          renderItem={({ item, section }) => {
            if (item.kind === "draft") return <QuickTaskDraftRow draft={item.draft} />;
            const { task } = item;
            return (
              <QuickTaskRow
                task={task}
                status={section.status}
                hasError={errors.has(task._id)}
                hasDraftComment={draftTaskIds.has(task._id)}
                creator={users?.find((user) => user._id === task.createdBy)}
                onLongPress={() => actions.openSheet(task)}
                selection={selecting ? { checked: selected.has(task._id), onToggle: () => toggleSelected(task._id) } : undefined}
              />
            );
          }}
          renderSectionFooter={({ section }) => <FoldFooter open={section.open} count={section.count} empty="No tasks" />}
          // Web: the list `p-3 pt-0`.
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
      {actions.dialogs}
      {/* The bulk bar takes the tab bar's place while selecting, as the inbox. */}
      <Tabs.Screen options={{ tabBarStyle: selecting ? { display: "none" } : undefined }} />
      <QuickTaskBulkBar
        isSelecting={selecting}
        selected={selected}
        tasks={tasks}
        totalCount={shown.length}
        users={users}
        projects={projects}
        allTags={allTags}
        currentUserId={currentUserId}
        onExitSelect={exitSelect}
        onSelectAll={() => setSelected(new Set(shown.map((task) => task._id)))}
        onClearSelection={() => setSelected(new Set())}
      />
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

/** One status section's header (`FoldHeader`), with To Do's web "Run All" ("Run" below `sm`) while it has tasks. */
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
  onRunAll?: () => void;
  runningAll: boolean;
}) {
  const scheme = useScheme();
  const { icon, text } = statusAppearance(status, scheme);
  return (
    <FoldHeader
      icon={icon}
      color={text}
      label={TASK_STATUS_LABELS[status]}
      count={count}
      noun="task"
      open={open}
      onToggle={onToggle}
      trailing={
        onRunAll ? (
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
        ) : undefined
      }
    />
  );
}
