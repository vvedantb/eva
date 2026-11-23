import type { ReactNode } from "react";
import { tokenTransition } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import type { Id } from "@eva/backend";
import { ProjectTabs } from "@/lib/components/projects/ProjectTabs";
import type { ProjectMainTab } from "@/lib/components/projects/ProjectMainTabs";
import { ProjectOverviewTab } from "@/lib/components/projects/ProjectOverviewTab";
import { ProjectTaskView } from "@/lib/components/projects/ProjectTaskView";
import { entityPathSegment, type EntityResolveStatus } from "@/lib/numId";
import type { ProjectDetailProject } from "./projectDetailHelpers";

interface ProjectDetailMainContentProps {
  projectId: Id<"projects">;
  project: ProjectDetailProject;
  mainTab: ProjectMainTab;
  isDraftOrFinalized: boolean;
  /** The coordinator: its chat and rail (Tasks first). */
  coordinatorContent: ReactNode;
  streamingActivity: string | undefined;
  sandboxStartupActivity: string | undefined;
  basePath: string;
  repoId: Id<"githubRepos">;
  /** A task is open (`$taskNumId`): it replaces the coordinator. */
  isTaskOpen: boolean;
  selectedTaskId?: Id<"agentTasks">;
  /** Resolve status of selectedTaskId's numId; undefined when no task is selected. */
  selectedTaskStatus?: EntityResolveStatus;
}

/**
 * The project body: Overview, the Plan while a project still plans, else the
 * coordinator — or, with a task open, that task's own chat and sandbox.
 */
export function ProjectDetailMainContent({
  projectId,
  project,
  mainTab,
  isDraftOrFinalized,
  coordinatorContent,
  streamingActivity,
  sandboxStartupActivity,
  basePath,
  repoId,
  isTaskOpen,
  selectedTaskId,
  selectedTaskStatus,
}: ProjectDetailMainContentProps) {
  const projectSegment = entityPathSegment(project);
  const projectHref = projectSegment
    ? `${basePath}/projects/${projectSegment}`
    : `${basePath}/projects`;
  const view =
    mainTab === "overview"
      ? "overview"
      : isDraftOrFinalized
        ? "plan"
        : isTaskOpen
          ? "task"
          : "coordinator";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={view === "task" ? `task:${selectedTaskId ?? ""}` : view}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={tokenTransition.fast}
        >
          {view === "overview" ? (
            <ProjectOverviewTab
              projectId={projectId}
              repoId={repoId}
              title={project.title}
              description={project.description}
              documentsHref={
                projectSegment
                  ? `${projectHref}/sandbox/documents`
                  : undefined
              }
            />
          ) : view === "plan" ? (
            <ProjectTabs
              projectId={projectId}
              projectPhase={project.phase}
              interviewRunning={project.interview !== undefined}
              rawInput={project.rawInput}
              generatedSpec={project.generatedSpec}
              conversationHistory={project.conversationHistory}
              streamingActivity={streamingActivity}
              sandboxStartupActivity={sandboxStartupActivity}
              basePath={basePath}
              repoId={repoId}
            />
          ) : view === "task" ? (
            <ProjectTaskView
              projectId={projectId}
              repoId={project.repoId}
              projectNumId={project.numId}
              coordinatorHref={`${projectHref}/sandbox/tasks`}
              documentsHref={
                projectSegment
                  ? `${projectHref}/sandbox/documents`
                  : undefined
              }
              taskId={selectedTaskId}
              taskStatus={selectedTaskStatus}
            />
          ) : (
            coordinatorContent
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
