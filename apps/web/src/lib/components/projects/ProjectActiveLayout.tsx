"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Spinner, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { entityPathSegment } from "@/lib/numId";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { useDetailPaneSignals } from "@/lib/hooks/useDetailPaneSignals";
import { ProjectTaskListPanel } from "./ProjectTaskListPanel";
import { TaskDetailInline } from "@/lib/components/tasks/TaskDetailInline";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { IconChecklist } from "@tabler/icons-react";
import { QuickTaskModal } from "../quick-tasks/QuickTaskModal";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import type { ProjectPhase } from "./ProjectPhaseBadge";
import type { EntityResolveStatus } from "@/lib/numId";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { TASK_TAGS } from "@eva/shared";

interface Project {
  _id: Id<"projects">;
  numId?: number;
  title: string;
  branchName?: string;
  sandboxId?: string;
  phase: ProjectPhase;
  rawInput: string;
}

interface ProjectActiveLayoutProps {
  projectId: Id<"projects">;
  project: Project;
  basePath: string;
  selectedTaskId?: Id<"agentTasks">;
  /** Resolve status of selectedTaskId's numId; undefined when no task is selected. */
  selectedTaskStatus?: EntityResolveStatus;
  detailTab?: TaskDetailTab;
}

export function ProjectActiveLayout({
  projectId,
  project,
  basePath,
  selectedTaskId: selectedTaskIdParam,
  selectedTaskStatus,
  detailTab,
}: ProjectActiveLayoutProps) {
  const navigate = useNavigate();
  const { repo } = useRepo();
  const cleanupTriggeredRef = useRef(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const projectPathSegment = entityPathSegment(project);

  const tasks = useQuery(api.agentTasks.listByProject, { projectId });
  const users = useQuery(api.users.listAll);
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const clearProjectSandbox = useMutation(api.projects.clearProjectSandbox);

  let selectedTaskId: Id<"agentTasks"> | null = null;
  if (selectedTaskIdParam && tasks) {
    const match = tasks.find((t) => t._id === selectedTaskIdParam);
    selectedTaskId = match?._id ?? null;
  }

  const selectedTask =
    selectedTaskId && tasks
      ? (tasks.find((t) => t._id === selectedTaskId) ?? null)
      : null;

  // Below `md` the primitive shows one pane at a time; selection is what moves a
  // phone to the detail. `nudge` covers re-tapping the task already in the URL
  // after switching back to the list, which changes no route state at all.
  const { expandRightSignal, collapseRightSignal, nudge } =
    useDetailPaneSignals(selectedTaskIdParam);

  const handleSelectTask = (id: Id<"agentTasks">) => {
    if (!projectPathSegment) return;
    const task = tasks?.find((t) => t._id === id);
    const taskPathSegment = task ? entityPathSegment(task) : null;
    if (!taskPathSegment) return;
    nudge();
    navigate({
      to: toInternalRepoHref(
        `${basePath}/projects/${projectPathSegment}/${taskPathSegment}/activity`,
      ),
    });
  };

  const handleCloseTask = () => {
    if (!projectPathSegment) return;
    navigate({
      to: toInternalRepoHref(`${basePath}/projects/${projectPathSegment}`),
    });
  };

  const activeDetailTab: TaskDetailTab = detailTab ?? "activity";

  const routing =
    selectedTaskId && selectedTask && projectPathSegment
      ? ({
          mode: "project-detail",
          project: {
            detailTab: activeDetailTab,
            onDetailTabChange: (tab: TaskDetailTab) => {
              const taskPathSegment = entityPathSegment(selectedTask);
              if (!taskPathSegment) return;
              navigate({
                to: toInternalRepoHref(
                  `${basePath}/projects/${projectPathSegment}/${taskPathSegment}/${tab}`,
                ),
              });
            },
          },
        } as const)
      : undefined;

  const tagSet = new Set<string>(TASK_TAGS);
  if (tasks) {
    for (const t of tasks) {
      if (t.tags) {
        for (const tag of t.tags) tagSet.add(tag);
      }
    }
  }
  const allTags = [...tagSet].sort();

  /* eslint-disable no-effect/no-event-handler --
     The project can reach a terminal phase from the server (another client, or
     the workflow itself), so tearing the sandbox down has to follow the live
     query rather than a local click. */
  useEffect(() => {
    if (
      (project.phase === "completed" || project.phase === "cancelled") &&
      project.sandboxId &&
      !cleanupTriggeredRef.current
    ) {
      cleanupTriggeredRef.current = true;
      clearProjectSandbox({ id: project._id }).catch(() => {});
    }
  }, [project.phase, project.sandboxId, project._id, clearProjectSandbox]);
  /* eslint-enable no-effect/no-event-handler */

  const notFoundPane = (
    <EntityNotFound
      entityLabel="task"
      backTo={
        projectPathSegment
          ? `${basePath}/projects/${projectPathSegment}`
          : `${basePath}/projects`
      }
      backLabel="Back to project"
    />
  );

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-background">
      <ResizablePanelLayout
        storageKey="project-tasks-split"
        leftDefaultSize="33%"
        leftMinWidthPx={260}
        rightMinWidthPx={360}
        // The detail pane is the point of this view, so it starts open —
        // unlike the sidebar-style panels the other call sites use.
        defaultRightCollapsed={false}
        expandRightSignal={expandRightSignal}
        collapseRightSignal={collapseRightSignal}
        mobilePaneLabels={{ left: "Tasks", right: "Details" }}
        leftPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <ProjectTaskListPanel
              tasks={tasks ?? []}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
              onCreateTask={() => setCreateTaskOpen(true)}
              projectNumId={project.numId}
            />
          </div>
        )}
        rightPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            {selectedTaskStatus === "loading" ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : selectedTaskStatus === "not-found" ? (
              notFoundPane
            ) : selectedTaskIdParam &&
              tasks !== undefined &&
              selectedTaskId === null ? (
              notFoundPane
            ) : selectedTaskId ? (
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={selectedTaskId}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={motionFast}
                >
                  <TaskDetailInline
                    taskId={selectedTaskId}
                    onClose={handleCloseTask}
                    allTags={allTags}
                    routing={routing}
                  />
                </m.div>
              </AnimatePresence>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <IconChecklist size={32} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Select a task to view details
                </p>
              </div>
            )}
          </div>
        )}
      />
      <QuickTaskModal
        isOpen={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        projectId={projectId}
        users={users ?? undefined}
        projects={projects ?? undefined}
        allTags={allTags}
      />
    </div>
  );
}
