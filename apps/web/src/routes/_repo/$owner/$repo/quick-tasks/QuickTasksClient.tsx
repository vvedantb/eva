import { useEffect, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  CenteredSpinner,
  TabsTransition,
  tokenTransition,
  EmptyState,
  Button,
} from "@vvedantb/ui";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import {
  QuickTaskModal,
  ImportLinearModal,
} from "@/lib/components/quick-tasks";
import { QuickTasksKanbanBoard } from "@/lib/components/quick-tasks/QuickTasksKanbanBoard";
import { QuickTasksListSplit } from "./_components/QuickTasksListSplit";
import { QuickTaskDetailShell } from "./_components/QuickTaskDetailShell";
import { QuickTaskTaskPageContent } from "./_components/QuickTaskTaskPageContent";
import { useQuickTaskRouteState } from "./_utils/useQuickTaskRouteState";
import { IconArchive, IconChecklist, IconPlus } from "@tabler/icons-react";
import { QuickTasksToolbar } from "./_components/QuickTasksToolbar";
import { ActiveFiltersBar } from "./_components/ActiveFiltersBar";
import {
  QuickTasksBulkBar,
  type BulkAction,
} from "./_components/QuickTasksBulkBar";
import { QuickTasksBulkModals } from "./_components/QuickTasksBulkModals";
import {
  QUICK_TASK_VIEWS,
  useFilteredQuickTasks,
  useQuickTaskFilters,
  useQuickTaskTodoDrafts,
} from "./_utils";
import { useAgentTaskByNumId } from "@/lib/useResolveByNumId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  TASK_TAGS,
  clearedQuickTaskFilter,
  clearedQuickTaskFilters,
  quickTaskFilterChips,
  archiveCopy,
  type ArchiveListMode,
  type QuickTaskFilterKey,
} from "@eva/shared";
import {
  rangeBetween,
  type SelectionToggleOptions,
} from "@/lib/components/quick-tasks/selectionRange";
import { useTaskArchive } from "@/lib/components/quick-tasks/_components/ArchiveTaskDialog";
import { useBulkRunTasks } from "@/lib/components/quick-tasks/RunTasksModal";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

export function QuickTasksClient() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const routeState = useQuickTaskRouteState();
  const numIdParam =
    typeof params.numId === "string" ? params.numId : undefined;
  const { basePath, repo, repoId } = useRepo();
  const taskResolve = useAgentTaskByNumId(numIdParam, repoId);
  const selectedTaskId =
    taskResolve.status === "ready"
      ? (taskResolve.convexId ?? undefined)
      : undefined;
  const [listMode, setListMode] = useState<ArchiveListMode>("active");
  const isArchivedList = listMode === "archived";
  const liveTasks = useQuery(
    api.agentTasks.getAllTasks,
    isArchivedList ? "skip" : { repoId: repo._id },
  );
  const archivedTasks = useQuery(
    api.agentTasks.listArchived,
    isArchivedList ? { repoId: repo._id } : "skip",
  );
  const tasks = isArchivedList ? archivedTasks : liveTasks;
  const { draft: draftParam } = useSearch({
    from: "/_repo/$owner/$repo/quick-tasks",
  });
  const drafts = useQuery(api.agentTasks.listDrafts, { repoId: repo._id });
  const initialDraft = draftParam
    ? drafts?.find((d) => d._id === draftParam)
    : undefined;
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"agentTasks">>>(
    new Set(),
  );
  const [anchorId, setAnchorId] = useState<Id<"agentTasks"> | null>(null);
  const [activeBulkAction, setActiveBulkAction] = useState<BulkAction | null>(
    null,
  );
  const { archive: archiveTasks } = useTaskArchive();
  const runSelected = useBulkRunTasks();
  const [filters, setParams] = useQuickTaskFilters();
  const { q, view, user } = filters;

  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const users = useQuery(api.users.listAll);

  const allTags = (() => {
    const tagSet = new Set<string>(TASK_TAGS);
    if (tasks) {
      for (const t of tasks) {
        if (t.tags) {
          for (const tag of t.tags) {
            tagSet.add(tag);
          }
        }
      }
    }
    return [...tagSet].sort();
  })();

  const quickTasks = useFilteredQuickTasks(tasks);
  const liveTodoDrafts = useQuickTaskTodoDrafts(repo._id);
  const todoDrafts = isArchivedList ? [] : liveTodoDrafts;
  const hasAnyTasks =
    (tasks ?? []).length > 0 || (!isArchivedList && (drafts ?? []).length > 0);
  const hasQuickTasks = quickTasks.length > 0 || todoDrafts.length > 0;

  const taskIdSet = (() => {
    const set = new Set<string>();
    if (tasks) {
      for (const t of tasks) set.add(t._id);
    }
    return set;
  })();

  if (isSelecting) {
    let needsPrune = false;
    for (const id of selectedIds) {
      if (!taskIdSet.has(id)) {
        needsPrune = true;
        break;
      }
    }
    if (needsPrune) {
      const next = new Set<Id<"agentTasks">>();
      for (const id of selectedIds) {
        if (taskIdSet.has(id)) next.add(id);
      }
      setSelectedIds(next);
    }
  }

  const selectedTasks = quickTasks.filter((t) => selectedIds.has(t._id));

  const toggleSelect = (
    id: Id<"agentTasks">,
    options?: SelectionToggleOptions<Id<"agentTasks">>,
  ) => {
    if (options?.range) {
      const range = rangeBetween(options.orderedIds ?? [], anchorId, id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const rangeId of range) next.add(rangeId);
        return next;
      });
      return;
    }
    setAnchorId(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const exitSelectMode = () => {
    setIsSelecting(false);
    setSelectedIds(new Set());
    setAnchorId(null);
    setActiveBulkAction(null);
  };

  const skipBulkArchive = () => {
    void archiveTasks([...selectedIds]).then((archived) => {
      if (archived) exitSelectMode();
    });
  };

  const skipBulkRun = () => {
    void runSelected(selectedIds).then(({ startedCount, count }) => {
      if (startedCount === count) {
        mutationSuccess(
          `Started ${count} task${count === 1 ? "" : "s"}`,
          "tasks-bulk-run",
        );
        exitSelectMode();
        return;
      }
      if (startedCount === 0) {
        mutationError("Couldn't start tasks", "tasks-bulk-run");
        return;
      }
      mutationError(
        `Started ${startedCount} of ${count} tasks. ${count - startedCount} failed to start.`,
        "tasks-bulk-run",
      );
    });
  };

  const userName = (id: string) => {
    const match = users?.find((u) => u._id === id);
    return match?.fullName ?? match?.firstName;
  };
  const activeFilterLabels = quickTaskFilterChips(filters, {
    user: userName,
  }).map((chip) => ({
    key: chip.key,
    label:
      chip.person === undefined ? (
        chip.text
      ) : (
        <>
          {chip.text}
          <span data-pii>{chip.person}</span>
        </>
      ),
  }));

  const clearFilter = (key: QuickTaskFilterKey) => {
    setParams(clearedQuickTaskFilter(key));
  };

  const clearAllFilters = () => {
    setParams(clearedQuickTaskFilters());
  };

  const closeBulkAction = () => setActiveBulkAction(null);

  useShortcut("newQuickTask", (e) => {
    e.preventDefault();
    setIsCreating(true);
  });

  const clearDraftParam = () => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, draft: undefined }),
      replace: true,
    });
  };

  const handleModalClose = () => {
    setIsCreating(false);
    if (draftParam !== undefined) {
      clearDraftParam();
    }
  };

  useEffect(() => {
    if (
      drafts !== undefined &&
      draftParam !== undefined &&
      initialDraft === undefined
    ) {
      clearDraftParam();
    }
    // eslint-disable-next-line react/exhaustive-deps
  }, [drafts, draftParam, initialDraft]);

  if (taskResolve.redirectTo !== null) {
    return <Navigate to={taskResolve.redirectTo} search={true} replace />;
  }

  if (
    numIdParam !== undefined &&
    taskResolve.status === "loading" &&
    view !== "list"
  ) {
    return (
      <PageWrapper title="Quick Tasks" fillHeight childPadding={false}>
        <CenteredSpinner label="Loading task" />
      </PageWrapper>
    );
  }

  if (
    numIdParam !== undefined &&
    taskResolve.status === "not-found" &&
    view !== "list"
  ) {
    return (
      <PageWrapper title="Quick Tasks" fillHeight childPadding={false}>
        <EntityNotFound
          entityLabel="task"
          backTo={`${basePath}/quick-tasks`}
          backLabel="Back to Quick Tasks"
        />
      </PageWrapper>
    );
  }

  if (selectedTaskId && routeState && view !== "list") {
    return (
      <QuickTaskDetailShell
        taskId={selectedTaskId}
        detailTab={routeState.detailTab}
        navSurface={routeState.surface}
        sandboxTab={
          routeState.surface === "sandbox" ? routeState.sandboxTab : undefined
        }
      >
        <QuickTaskTaskPageContent
          taskId={selectedTaskId}
          routeState={routeState}
        />
      </QuickTaskDetailShell>
    );
  }

  return (
    <>
      <PageWrapper
        title="Quick Tasks"
        fillHeight
        childPadding={false}
        headerRight={
          <QuickTasksToolbar
            listMode={listMode}
            onListModeChange={(mode) => {
              exitSelectMode();
              setListMode(mode);
            }}
            view={view}
            onViewChange={(v: "kanban" | "list") => {
              setParams({ view: v });
              if (selectedTaskId && v !== "list") {
                navigate({
                  to: toInternalRepoHref(`${basePath}/quick-tasks`),
                  search: (prev) => prev,
                });
              }
            }}
            searchQuery={q}
            onSearchChange={(v) => setParams({ q: v ?? "" })}
            hasQuickTasks={hasAnyTasks}
            isSelecting={isSelecting}
            onStartSelecting={() => setIsSelecting(true)}
            onCreateTask={() => setIsCreating(true)}
            onImport={() => setIsImporting(true)}
            users={users}
            userFilter={user}
            onUserFilterChange={(v) => setParams({ user: v })}
            allTags={allTags}
          />
        }
      >
        <div className="relative flex min-w-0 flex-1 min-h-0 flex-col overflow-hidden p-3 pt-0">
          {activeFilterLabels.length > 0 && (
            <ActiveFiltersBar
              filters={activeFilterLabels}
              onClearFilter={clearFilter}
              onClearAll={clearAllFilters}
            />
          )}
          <AnimatePresence mode="wait" initial={false}>
            {tasks === undefined ? (
              <m.div
                key="quick-tasks-loading"
                className="flex min-w-0 flex-1 min-h-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={tokenTransition.base}
              >
                <CenteredSpinner label="Loading quick tasks" />
              </m.div>
            ) : !hasQuickTasks &&
              !(view === "list" && numIdParam !== undefined) ? (
              <m.div
                key="quick-tasks-empty"
                className="flex min-h-0 flex-1 items-center justify-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={tokenTransition.base}
              >
                {isArchivedList && !hasAnyTasks ? (
                  <EmptyState.Root enter>
                    <EmptyState.Icon icon={IconArchive} size={24} />
                    <EmptyState.Title>
                      {archiveCopy("task").emptyArchived}
                    </EmptyState.Title>
                  </EmptyState.Root>
                ) : (
                  <EmptyState.Root enter={!hasAnyTasks}>
                    <EmptyState.Icon icon={IconChecklist} size={24} />
                    <EmptyState.Title>
                      {hasAnyTasks ? "No matching quick tasks" : "No quick tasks"}
                    </EmptyState.Title>
                    <EmptyState.Description>
                      {hasAnyTasks
                        ? "Try clearing filters to see all tasks."
                        : "Quick tasks are standalone tasks not tied to a feature. Create one for small, one-off work."}
                    </EmptyState.Description>
                    <EmptyState.Actions>
                      <Button
                        size="sm"
                        onClick={
                          hasAnyTasks
                            ? clearAllFilters
                            : () => setIsCreating(true)
                        }
                        className="mt-6"
                      >
                        <IconPlus size={16} />
                        {hasAnyTasks ? "Clear filters" : "Create Quick Task"}
                      </Button>
                    </EmptyState.Actions>
                  </EmptyState.Root>
                )}
              </m.div>
            ) : (
              <m.div
                key="quick-tasks-views"
                className="flex min-w-0 flex-1 min-h-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={tokenTransition.base}
              >
                <TabsTransition
                  value={view}
                  order={QUICK_TASK_VIEWS}
                  className="flex min-w-0 flex-1 min-h-0"
                  panelClassName="flex min-w-0 flex-1 min-h-0"
                >
                  {view === "kanban" ? (
                    <QuickTasksKanbanBoard
                      tasks={quickTasks}
                      isSelecting={isSelecting}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                      archived={isArchivedList}
                    />
                  ) : (
                    <QuickTasksListSplit
                      tasks={quickTasks}
                      isSelecting={isSelecting}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                      selectedTaskId={selectedTaskId}
                      selectedTaskStatus={
                        numIdParam !== undefined ? taskResolve.status : undefined
                      }
                      detailTab={routeState?.detailTab}
                      sandboxTab={
                        routeState?.surface === "sandbox"
                          ? routeState.sandboxTab
                          : undefined
                      }
                      navSurface={routeState?.surface ?? "detail"}
                      archived={isArchivedList}
                    />
                  )}
                </TabsTransition>
              </m.div>
            )}
          </AnimatePresence>
          {hasQuickTasks && !isArchivedList && (
            <QuickTasksBulkBar
              isSelecting={isSelecting}
              selectedCount={selectedIds.size}
              totalCount={quickTasks.length}
              onExitSelect={exitSelectMode}
              onSelectAll={() =>
                setSelectedIds(new Set(quickTasks.map((t) => t._id)))
              }
              onClearSelection={() => {
                setSelectedIds(new Set());
                setAnchorId(null);
              }}
              activeBulkAction={activeBulkAction}
              onSetBulkAction={setActiveBulkAction}
              onSkipConfirm={{
                archive: skipBulkArchive,
                run: skipBulkRun,
              }}
            />
          )}
        </div>
      </PageWrapper>
      <QuickTaskModal
        key={initialDraft?._id ?? "new"}
        isOpen={isCreating || initialDraft !== undefined}
        initialDraft={initialDraft}
        onClose={handleModalClose}
        users={users ?? undefined}
        projects={projects ?? undefined}
        allTags={allTags}
      />
      <ImportLinearModal
        isOpen={isImporting}
        onClose={() => setIsImporting(false)}
      />
      <QuickTasksBulkModals
        activeBulkAction={activeBulkAction}
        onCloseBulkAction={closeBulkAction}
        selectedTaskIds={selectedIds}
        selectedTasks={selectedTasks}
        onSuccess={exitSelectMode}
      />
    </>
  );
}
