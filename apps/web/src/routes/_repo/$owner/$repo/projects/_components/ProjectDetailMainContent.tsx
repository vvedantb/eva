import type { ReactNode } from "react";
import { TabsTransition } from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import { ProjectTabs } from "@/lib/components/projects/ProjectTabs";
import { ProjectActiveLayout } from "@/lib/components/projects/ProjectActiveLayout";
import {
  PROJECT_MAIN_TABS,
  type ProjectMainTab,
} from "@/lib/components/projects/ProjectMainTabs";
import { ProjectOverviewTab } from "@/lib/components/projects/ProjectOverviewTab";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import type { EntityResolveStatus } from "@/lib/numId";
import type { ProjectDetailProject } from "./projectDetailHelpers";

interface ProjectDetailMainContentProps {
  projectId: Id<"projects">;
  project: ProjectDetailProject;
  isSandboxSurface: boolean;
  mainTab: ProjectMainTab;
  isDraftOrFinalized: boolean;
  sandboxContent: ReactNode;
  streamingActivity: string | undefined;
  sandboxStartupActivity: string | undefined;
  basePath: string;
  repoId: Id<"githubRepos">;
  selectedTaskId?: Id<"agentTasks">;
  selectedTaskStatus?: EntityResolveStatus;
  detailTab?: TaskDetailTab;
}

export function ProjectDetailMainContent({
  projectId,
  project,
  isSandboxSurface,
  mainTab,
  isDraftOrFinalized,
  sandboxContent,
  streamingActivity,
  sandboxStartupActivity,
  basePath,
  repoId,
  selectedTaskId,
  selectedTaskStatus,
  detailTab,
}: ProjectDetailMainContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabsTransition
        value={isSandboxSurface ? "sandbox" : mainTab}
        order={PROJECT_MAIN_TABS}
        className="flex min-h-0 flex-1 flex-col"
        panelClassName={
          isSandboxSurface
            ? "min-h-0 flex-1 overflow-hidden"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        {isSandboxSurface ? (
          sandboxContent
        ) : mainTab === "overview" ? (
          <ProjectOverviewTab
            projectId={projectId}
            title={project.title}
            description={project.description}
          />
        ) : isDraftOrFinalized ? (
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
        ) : (
          <ProjectActiveLayout
            projectId={projectId}
            project={project}
            basePath={basePath}
            selectedTaskId={selectedTaskId}
            selectedTaskStatus={selectedTaskStatus}
            detailTab={detailTab}
          />
        )}
      </TabsTransition>
    </div>
  );
}
