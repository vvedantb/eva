import { useEffect, useState, type ReactNode } from "react";
import { m, AnimatePresence } from "motion/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { motionBase } from "@eva/ui";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EmptyState } from "@/lib/components/ui/EmptyState";
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
import { IconChecklist } from "@tabler/icons-react";
import { TASK_STATUSES } from "@/lib/components/tasks/TaskStatusBadge";
import { QuickTasksToolbar } from "./_components/QuickTasksToolbar";
import {
  QuickTaskDetailSkeleton,
  QuickTasksListSkeleton,
} from "./_components/QuickTasksSkeletons";
import { ActiveFiltersBar } from "./_components/ActiveFiltersBar";
import { KanbanBoardSkeleton } from "@/lib/components/kanban/KanbanBoardSkeleton";
import {
  QuickTasksBulkBar,
  type BulkAction,
} from "./_components/QuickTasksBulkBar";
import { QuickTasksBulkModals } from "./_components/QuickTasksBulkModals";
import { useFilteredQuickTasks, useQuickTaskFilters } from "./_utils";
import { useAgentTaskByNumId } from "@/lib/useResolveByNumId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { TASK_TAGS } from "@eva/shared";
import { useBulkDeleteTasks } from "@/lib/components/quick-tasks/DeleteTasksModal";
import { useBulkRunTasks } from "@/lib/components/quick-tasks/RunTasksModal";
import {
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";

export function QuickTasksClient() {
  const navigate = useNavigate();
  // The open task (if any) comes from the child route params, read here at the
  // layout level so the list stays mounted while the detail changes.
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
  const tasks = useQuery(api.agentTasks.getAllTasks, { repoId: repo._id });
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
  const [activeBulkAction, setActiveBulkAction] = useState<BulkAction | null>(
    null,
  );
  const deleteSelected = useBulkDeleteTasks();
  const runSelected = useBulkRunTasks();
  const [
    { q, view, project, user, assignee, tags, timeRange, statuses },
    setParams,
  ] = useQuickTaskFilters();

  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const users = useQuery(api.users.listAll);

  const projectNames = (() => {
    const map = new Map<string, string>();
    if (projects) {
      for (const p of projects) {
        map.set(p._id, p.title);
      }
    }
    return map;
  })();

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
  const hasAnyTasks = (tasks ?? []).length > 0;
  const hasQuickTasks = quickTasks.length > 0;

  const taskIdSet = (() => {
    const set = new Set<string>();
    if (tasks) {
      for (const t of tasks) set.add(t._id);
    }
    return set;
  })();

  // Drop selections for tasks that disappeared (adjust during render).
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

  const toggleSelect = (id: Id<"agentTasks">) => {
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
    setActiveBulkAction(null);
  };

  const skipBulkDelete = () => {
    void deleteSelected(selectedIds).then(exitSelectMode);
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

  const activeFilterLabels = (() => {
    const labels: Array<{ key: string; label: ReactNode }> = [];
    if (project === "all") {
      labels.push({ key: "project", label: "All Projects" });
    } else if (project !== "none") {
      const name = projects?.find((p) => p._id === project)?.title ?? "Project";
      labels.push({ key: "project", label: `Project: ${name}` });
    }
    if (user !== "all") {
      const u = users?.find((u) => u._id === user);
      const name = u?.fullName ?? u?.firstName ?? "User";
      labels.push({
        key: "user",
        label: (
          <>
            Created by: <span data-pii>{name}</span>
          </>
        ),
      });
    }
    if (assignee !== "all") {
      const name =
        assignee === "unassigned"
          ? "Unassigned"
          : (users?.find((u) => u._id === assignee)?.fullName ??
            users?.find((u) => u._id === assignee)?.firstName ??
            "Code Reviewer");
      labels.push({
        key: "assignee",
        label:
          assignee === "unassigned" ? (
            `Code reviewer: ${name}`
          ) : (
            <>
              Code reviewer: <span data-pii>{name}</span>
            </>
          ),
      });
    }
    if (statuses.length !== TASK_STATUSES.length) {
      labels.push({
        key: "statuses",
        label: `${statuses.length} Status${statuses.length !== 1 ? "es" : ""}`,
      });
    }
    if (tags.length > 0) {
      labels.push({
        key: "tags",
        label: `${tags.length} Tag${tags.length !== 1 ? "s" : ""}`,
      });
    }
    if (timeRange !== "all") {
      const rangeLabels: Record<string, string> = {
        "7d": "Last 7 days",
        "30d": "Last 30 days",
        "90d": "Last 90 days",
      };
      labels.push({
        key: "timeRange",
        label: rangeLabels[timeRange] ?? timeRange,
      });
    }
    return labels;
  })();

  const clearFilter = (key: string) => {
    switch (key) {
      case "project":
        setParams({ project: "none" });
        break;
      case "user":
        setParams({ user: "all" });
        break;
      case "assignee":
        setParams({ assignee: "all" });
        break;
      case "statuses":
        setParams({ statuses: [...TASK_STATUSES] });
        break;
      case "tags":
        setParams({ tags: [] });
        break;
      case "timeRange":
        setParams({ timeRange: "all" });
        break;
    }
  };

  const clearAllFilters = () => {
    setParams({
      project: "none",
      user: "all",
      assignee: "all",
      statuses: [...TASK_STATUSES],
      tags: [],
      timeRange: "all",
    });
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

  // If the drafts list has loaded and the param points to a non-existent draft
  // (deleted or stale link), clean up the URL.
  useEffect(() => {
    if (
      drafts !== undefined &&
      draftParam !== undefined &&
      initialDraft === undefined
    ) {
      clearDraftParam();
    }
    // clearDraftParam is defined inline each render — only run when these values change.
    // eslint-disable-next-line react/exhaustive-deps
  }, [drafts, draftParam, initialDraft]);

  // Pre-numId link (old notification href, PR body): swap the Convex id in the
  // path for the task's numId before rendering anything else.
  if (taskResolve.redirectTo !== null) {
    return <Navigate to={taskResolve.redirectTo} search={true} replace />;
  }

  // URL points at a task that is still resolving or no longer exists.
  // List view never takes this full-page path — it shows loading/not-found
  // in the detail pane instead so the list itself stays mounted.
  if (
    numIdParam !== undefined &&
    taskResolve.status === "loading" &&
    view !== "list"
  ) {
    return (
      <PageWrapper title="Quick Tasks" fillHeight childPadding={false}>
        <QuickTaskDetailSkeleton />
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

  // Kanban and table keep the dedicated full-page detail when a task is open.
  // List view instead renders the master/detail split further down.
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
        // The page header stays the list's own: title, search, filters, view
        // toggle, New Task. An open task's chrome (surface switcher, actions,
        // prev/next) belongs to the detail pane, which renders it itself — in
        // the header it read as a breadcrumb replacing the page title and a
        // switcher floating over the middle of the list.
        title="Quick Tasks"
        fillHeight
        childPadding={false}
        headerRight={
          <QuickTasksToolbar
            view={view}
            onViewChange={(v: "kanban" | "list") => {
              setParams({ view: v });
              // Only list view renders an open task inline (master/detail
              // split); kanban shows the board, so close the task.
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
            projects={projects}
            projectFilter={project}
            onProjectFilterChange={(v) => setParams({ project: v })}
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
                transition={motionBase}
              >
                {view === "list" ? (
                  <QuickTasksListSkeleton />
                ) : (
                  <KanbanBoardSkeleton
                    columns={
                      statuses.length > 0
                        ? statuses.length
                        : TASK_STATUSES.length
                    }
                    aria-label="Loading quick tasks"
                  />
                )}
              </m.div>
            ) : !hasQuickTasks &&
            !(view === "list" && numIdParam !== undefined) ? (
              <m.div
                key="quick-tasks-empty"
                className="flex min-h-0 flex-1 items-center justify-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={motionBase}
              >
                <EmptyState
                  icon={
                    <IconChecklist
                      size={24}
                      className="text-muted-foreground"
                    />
                  }
                  title={
                    hasAnyTasks ? "No matching quick tasks" : "No quick tasks"
                  }
                  description={
                    hasAnyTasks
                      ? "Try clearing filters to see all tasks."
                      : "Quick tasks are standalone tasks not tied to a feature. Create one for small, one-off work."
                  }
                  actionLabel={
                    hasAnyTasks ? "Clear filters" : "Create Quick Task"
                  }
                  onAction={
                    hasAnyTasks ? clearAllFilters : () => setIsCreating(true)
                  }
                  animate={!hasAnyTasks}
                />
              </m.div>
            ) : view === "kanban" ? (
              <m.div
                key="quick-tasks-board"
                className="flex min-w-0 flex-1 min-h-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={motionBase}
              >
                <QuickTasksKanbanBoard
                  tasks={quickTasks}
                  projectNames={projectNames}
                  isSelecting={isSelecting}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                />
              </m.div>
            ) : (
              <m.div
                key="quick-tasks-list"
                className="flex min-w-0 flex-1 min-h-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={motionBase}
              >
                <QuickTasksListSplit
                  tasks={quickTasks}
                  projectNames={projectNames}
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
                />
              </m.div>
            )}
          </AnimatePresence>
          {hasQuickTasks && (
            <QuickTasksBulkBar
              isSelecting={isSelecting}
              selectedCount={selectedIds.size}
              onExitSelect={exitSelectMode}
              activeBulkAction={activeBulkAction}
              onSetBulkAction={setActiveBulkAction}
              onSkipConfirm={{
                delete: skipBulkDelete,
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
