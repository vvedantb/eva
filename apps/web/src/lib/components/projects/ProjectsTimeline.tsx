"use client";

import { useRef, useEffect } from "react";
import type { MutableRefObject } from "react";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
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
  ListEnter,
} from "@vvedantb/ui";
import type { GanttFeature, GanttStatus, GanttRange } from "@vvedantb/ui";
import type { ProjectStage } from "@eva/shared/projectStatus";
import type { ProjectListStatus } from "@eva/shared/projectView";
import { projectStageConfig } from "@/lib/components/projects/ProjectPhaseBadge";
import { entityPathSegment } from "@/lib/numId";
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

interface ProjectsTimelineProps {
  projects: Project[];
  /** The project's derived stage (`projectStatus`). */
  stageOf: (projectId: string) => ProjectStage;
  /** Derived status by project id (`useProjectListStatuses`). */
  statuses: ReadonlyMap<string, ProjectListStatus>;
  /** The project page (a public slash path). */
  hrefOf: (project: Project) => string;
  range: GanttRange;
  zoom: number;
  onRangeChange: (range: GanttRange) => void;
  onZoomChange: (zoom: number) => void;
}

// status.color is only used by the sidebar dot fallback (we supply a stage
// icon instead), but GanttFeature requires it, so map stages to their bar colour.
function stageStatus(stage: ProjectStage): GanttStatus {
  const { label, barColor } = projectStageConfig[stage];
  return { id: stage, name: label, color: barColor };
}

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
  stageOf,
  statuses,
  hrefOf,
  range,
  zoom,
  onRangeChange,
  onZoomChange,
}: ProjectsTimelineProps) {
  const navigate = useNavigate();
  const updateProject = useMutation(api.projects.update).withOptimisticUpdate(
    (localStore, args) => {
      const {
        id: _id,
        priority,
        projectLead,
        model,
        providerAccountId,
        ...safeFields
      } = args;
      patchLoadedQuery(
        localStore,
        api.projects.listAccessible,
        {},
        (current) => ({
          ...current,
          projects: current.projects.map((p) =>
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
                  ...(model !== undefined ? { model: model ?? undefined } : {}),
                  ...(providerAccountId !== undefined
                    ? { providerAccountId: providerAccountId ?? undefined }
                    : {}),
                }
              : p,
          ),
        }),
      );
    },
  );

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
        status: stageStatus(stageOf(project._id)),
      });
    } else {
      unscheduled.push(project);
    }
  }

  const features = scheduled;

  const scrollToTodayRef = useRef<(() => void) | null>(null);

  const handleSelectItem = (id: string) => {
    const project = scheduledProjectMap.get(id);
    if (!project || entityPathSegment(project) === null) return;
    navigate({ to: toInternalRepoHref(hrefOf(project)) });
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
              const config = projectStageConfig[stageOf(feature.id)];
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
                          counts={statuses.get(feature.id)?.counts}
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
                        stage={stageOf(feature.id)}
                        counts={statuses.get(feature.id)?.counts}
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
        stageOf={stageOf}
        hrefOf={hrefOf}
        onSchedule={handleSchedule}
      />
    </div>
  );
}
