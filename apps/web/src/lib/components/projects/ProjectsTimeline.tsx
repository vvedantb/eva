"use client";

import { useRef, useEffect } from "react";
import type { MutableRefObject } from "react";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import {
  GanttProvider,
  GanttSidebar,
  GanttSidebarItem,
  GanttTimeline,
  GanttHeader,
  GanttFeatureList,
  GanttFeatureItem,
  GanttToday,
  useGanttContext,
  type GanttFeature,
  type GanttStatus,
  type Range,
} from "@eva/ui";
import {
  phaseConfig,
  type ProjectPhase,
} from "@/lib/components/projects/ProjectPhaseBadge";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { TimelineBar } from "./_components/TimelineBar";
import { TimelineSidebarMeta } from "./_components/TimelineSidebarMeta";
import { TimelineToolbar } from "./_components/TimelineToolbar";
import { UnscheduledProjectsSection } from "./_components/UnscheduledProjectsSection";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

type Project = FunctionReturnType<typeof api.projects.list>[number];
type ProjectProgress = FunctionReturnType<
  typeof api.projects.listTaskProgress
>[number];

interface ProjectsTimelineProps {
  projects: Project[];
  basePath: string;
  range: Range;
  zoom: number;
  onRangeChange: (range: Range) => void;
  onZoomChange: (zoom: number) => void;
}

// status.color is only used by the sidebar dot fallback (we supply a phase icon
// instead), but GanttFeature requires it, so map phases to their bar colour.
const phaseStatusMap: Record<ProjectPhase, GanttStatus> = {
  draft: {
    id: "draft",
    name: "Draft",
    color: "rgb(var(--muted-foreground) / 0.5)",
  },
  finalized: { id: "finalized", name: "Finalized", color: "rgb(59 130 246)" },
  in_progress: {
    id: "in_progress",
    name: "In Progress",
    color: "rgb(var(--status-progress-bar))",
  },
  business_review: {
    id: "business_review",
    name: "Business Review",
    color: "rgb(var(--status-business-review-bar))",
  },
  code_review: {
    id: "code_review",
    name: "Code Review",
    color: "rgb(var(--status-code-review-bar))",
  },
  completed: {
    id: "completed",
    name: "Merged",
    color: "rgb(var(--status-done-bar))",
  },
  cancelled: {
    id: "cancelled",
    name: "Cancelled",
    color: "rgb(var(--status-cancelled-bar))",
  },
};

/** Lives inside GanttProvider so it can read scrollToToday from context and
 *  hand it to the toolbar, which renders outside the provider. */
function GanttTodayBridge({
  targetRef,
}: {
  targetRef: MutableRefObject<(() => void) | null>;
}) {
  const { scrollToToday } = useGanttContext();
  useEffect(() => {
    targetRef.current = scrollToToday ?? null;
    return () => {
      targetRef.current = null;
    };
  }, [scrollToToday, targetRef]);
  return null;
}

export function ProjectsTimeline({
  projects,
  basePath,
  range,
  zoom,
  onRangeChange,
  onZoomChange,
}: ProjectsTimelineProps) {
  const navigate = useNavigate();
  const { repo } = useRepo();
  const progressList = useQuery(api.projects.listTaskProgress, {
    repoId: repo._id,
  });
  const updateProject = useMutation(api.projects.update).withOptimisticUpdate(
    (localStore, args) => {
      const currentList = localStore.getQuery(api.projects.list, {
        repoId: repo._id,
      });
      if (currentList !== undefined) {
        const {
          id: _id,
          priority,
          projectLead,
          codeReviewer,
          model,
          providerAccountId,
          ...safeFields
        } = args;
        localStore.setQuery(
          api.projects.list,
          { repoId: repo._id },
          currentList.map((p) =>
            p._id === args.id
              ? {
                  ...p,
                  ...safeFields,
                  ...(priority !== undefined
                    ? { priority: priority ?? undefined }
                    : {}),
                  ...(projectLead !== undefined
                    ? { projectLead: projectLead ?? undefined }
                    : {}),
                  ...(codeReviewer !== undefined
                    ? { codeReviewer: codeReviewer ?? undefined }
                    : {}),
                  ...(model !== undefined ? { model: model ?? undefined } : {}),
                  ...(providerAccountId !== undefined
                    ? { providerAccountId: providerAccountId ?? undefined }
                    : {}),
                }
              : p,
          ),
        );
      }
    },
  );

  const progressMap = new Map<string, ProjectProgress>();
  for (const entry of progressList ?? []) {
    progressMap.set(entry.projectId, entry);
  }

  const scheduled: GanttFeature[] = [];
  const scheduledProjectMap = new Map<string, Project>();
  const unscheduled: Project[] = [];

  for (const project of projects) {
    if (project.projectStartDate && project.projectEndDate) {
      scheduledProjectMap.set(project._id, project);
      scheduled.push({
        id: project._id,
        name: project.title,
        startAt: new Date(project.projectStartDate),
        endAt: new Date(project.projectEndDate),
        status: phaseStatusMap[project.phase],
      });
    } else {
      unscheduled.push(project);
    }
  }

  const features = scheduled;

  const scrollToTodayRef = useRef<(() => void) | null>(null);

  const handleSelectItem = (id: string) => {
    const project = scheduledProjectMap.get(id);
    const segment = project ? entityPathSegment(project) : null;
    if (!segment) return;
    navigate({ to: toInternalRepoHref(`${basePath}/projects/${segment}`) });
  };

  const handleMove = (id: string, startAt: Date, endAt: Date | null) => {
    if (!endAt) return;
    const project = scheduledProjectMap.get(id);
    if (!project) return;
    void catchMutationError(
      updateProject({
        id: project._id,
        projectStartDate: startAt.getTime(),
        projectEndDate: endAt.getTime(),
      }),
      "Couldn't update project dates",
      "project-timeline-move",
    );
  };

  const handleSchedule = (id: Id<"projects">, start: number, end: number) => {
    void withMutationToast(
      updateProject({ id, projectStartDate: start, projectEndDate: end }),
      "Project scheduled",
      "Couldn't schedule project",
      "project-schedule",
    );
  };

  if (projects.length === 0) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 animate-in fade-in duration-300">
      <TimelineToolbar
        range={range}
        zoom={zoom}
        onRangeChange={onRangeChange}
        onZoomChange={onZoomChange}
        onToday={() => scrollToTodayRef.current?.()}
      />

      {features.length > 0 ? (
        <GanttProvider
          range={range}
          zoom={zoom}
          onZoomChange={onZoomChange}
          className="min-h-0 flex-1"
        >
          <GanttTodayBridge targetRef={scrollToTodayRef} />
          <GanttSidebar headerTitle="Projects" headerMeta="Progress">
            {features.map((feature, index) => {
              const project = scheduledProjectMap.get(feature.id);
              const phase = project?.phase ?? "draft";
              const config = phaseConfig[phase];
              const Icon = config.icon;
              return (
                <ListEnter key={feature.id} index={index}>
                <GanttSidebarItem
                  feature={feature}
                  onSelectItem={handleSelectItem}
                  icon={<Icon size={14} className={config.text} />}
                  meta={
                    project ? (
                      <TimelineSidebarMeta
                        progress={progressMap.get(feature.id)}
                        lead={project.projectLead}
                        members={project.members}
                        fallbackUserId={project.userId}
                      />
                    ) : undefined
                  }
                />
                </ListEnter>
              );
            })}
          </GanttSidebar>
          <GanttTimeline>
            <GanttHeader />
            <GanttFeatureList>
              {features.map((feature, index) => {
                const phase =
                  scheduledProjectMap.get(feature.id)?.phase ?? "draft";
                return (
                  <ListEnter
                    key={feature.id}
                    index={index}
                    slide={false}
                    className="flex"
                  >
                    <GanttFeatureItem
                      {...feature}
                      onMove={handleMove}
                      onClick={() => handleSelectItem(feature.id)}
                    >
                      <TimelineBar
                        name={feature.name}
                        phase={phase}
                        progress={progressMap.get(feature.id)}
                      />
                    </GanttFeatureItem>
                  </ListEnter>
                );
              })}
            </GanttFeatureList>
            <GanttToday />
          </GanttTimeline>
        </GanttProvider>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-surface border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No projects have a start and end date yet. Schedule one below to see
          it on the timeline.
        </div>
      )}

      <UnscheduledProjectsSection
        projects={unscheduled}
        basePath={basePath}
        onSchedule={handleSchedule}
      />
    </div>
  );
}
