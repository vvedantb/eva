"use client";

import type { Id } from "@eva/backend";
import { ProjectDescription } from "./ProjectDescription";
import { ProjectFieldsPanel } from "./ProjectFieldsPanel";
import { ProjectProgressChart } from "./ProjectProgressChart";
import { ProjectSummarySection } from "./ProjectSummarySection";
import { useProjectTaskStatus } from "./useProjectStatus";

/**
 * Overview tab: title, project context, the 30-day progress chart and the
 * summary on the left, every project field in a single column on the right. Same two-column shape as the task detail page.
 */
export function ProjectOverviewTab({
  projectId,
  repoId,
  title,
  description,
  documentsHref,
  projectHref,
  readOnly,
}: {
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  title: string;
  description: string | undefined;
  documentsHref: string | undefined;
  /** The project's work page: a task picked on the progress chart opens there. */
  projectHref: string | undefined;
  /** An archived project: the context and every field are read-only. */
  readOnly: boolean;
}) {
  const { status } = useProjectTaskStatus(projectId, repoId);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar md:overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[14fr_6fr] md:grid-rows-1 md:overflow-hidden">
        <div className="min-w-0 space-y-4 px-4 pt-4 md:overflow-y-auto md:scrollbar md:px-6 md:pt-5">
          <h1 className="text-lg font-semibold text-foreground md:text-xl">
            {title}
          </h1>
          <ProjectDescription
            description={description}
            projectId={projectId}
            className="px-0 pt-0 pb-0"
            clamp={false}
            readOnly={readOnly}
          />
          <ProjectProgressChart projectId={projectId} projectHref={projectHref} />
          <ProjectSummarySection
            projectId={projectId}
            status={status}
            documentsHref={documentsHref}
          />
        </div>
        <div className="mt-6 flex shrink-0 flex-col px-4 pb-4 md:mt-0 md:overflow-y-auto md:scrollbar md:px-0 md:pb-6 md:pl-8 md:pr-6 md:pt-5">
          <ProjectFieldsPanel projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
