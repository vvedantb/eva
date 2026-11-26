import type { ReactNode } from "react";
import { TabsTransition } from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import {
  PROJECT_MAIN_TABS,
  type ProjectMainTab,
} from "@/lib/components/projects/ProjectMainTabs";
import { ProjectOverviewTab } from "@/lib/components/projects/ProjectOverviewTab";
import { ProjectTaskView } from "@/lib/components/projects/ProjectTaskView";
import { entityPathSegment, type EntityResolveStatus } from "@/lib/numId";
import type { ProjectDetailProject } from "./projectDetailHelpers";

interface ProjectDetailMainContentProps {
  projectId: Id<"projects">;
  project: ProjectDetailProject;
  mainTab: ProjectMainTab;
  /** The coordinator: its chat and rail (Tasks first). */
  coordinatorContent: ReactNode;
  basePath: string;
  /** A task is open (`$taskNumId`): it replaces the coordinator. */
  isTaskOpen: boolean;
  selectedTaskId?: Id<"agentTasks">;
  /** Resolve status of selectedTaskId's numId; undefined when no task is selected. */
  selectedTaskStatus?: EntityResolveStatus;
}

/**
 * The project body: Overview, else the coordinator — or, with a task open,
 * that task's own chat and sandbox.
 */
export function ProjectDetailMainContent({
  projectId,
  project,
  mainTab,
  coordinatorContent,
  basePath,
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
      : isTaskOpen
        ? "task"
        : "coordinator";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabsTransition
        value={mainTab}
        order={PROJECT_MAIN_TABS}
        className="flex min-h-0 flex-1 flex-col"
        panelClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {view === "overview" ? (
          <ProjectOverviewTab
            projectId={projectId}
            repoId={project.repoId}
            title={project.title}
            description={project.description}
            readOnly={project.archivedAt !== undefined}
            documentsHref={
              projectSegment
                ? `${projectHref}/sandbox/documents`
                : undefined
            }
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
      </TabsTransition>
    </div>
  );
}
