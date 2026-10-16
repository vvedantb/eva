import type { ReactNode } from "react";
import { motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import type { Id } from "@eva/backend";
import { ProjectTabs } from "@/lib/components/projects/ProjectTabs";
import { ProjectActiveLayout } from "@/lib/components/projects/ProjectActiveLayout";
import type { ProjectMainTab } from "@/lib/components/projects/ProjectMainTabs";
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
      <AnimatePresence mode="wait" initial={false}>
        {isSandboxSurface ? (
          <m.div
            key="sandbox"
            className="min-h-0 flex-1 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            {sandboxContent}
          </m.div>
        ) : mainTab === "overview" ? (
          <m.div
            key="overview"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <ProjectOverviewTab
              projectId={projectId}
              title={project.title}
              description={project.description}
            />
          </m.div>
        ) : isDraftOrFinalized ? (
          <m.div
            key="plan"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <ProjectTabs
              projectId={projectId}
              projectPhase={project.phase}
              activeWorkflowId={project.activeWorkflowId}
              rawInput={project.rawInput}
              generatedSpec={project.generatedSpec}
              conversationHistory={project.conversationHistory}
              streamingActivity={streamingActivity}
              sandboxStartupActivity={sandboxStartupActivity}
              basePath={basePath}
              repoId={repoId}
            />
          </m.div>
        ) : (
          <m.div
            key="tasks"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <ProjectActiveLayout
              projectId={projectId}
              project={project}
              basePath={basePath}
              selectedTaskId={selectedTaskId}
              selectedTaskStatus={selectedTaskStatus}
              detailTab={detailTab}
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
