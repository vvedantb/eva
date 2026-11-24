"use client";

import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import { IconChevronRight } from "@tabler/icons-react";
import type { ProjectStage } from "@eva/shared/projectStatus";
import { projectStageConfig } from "@/lib/components/projects/ProjectPhaseBadge";
import { ScheduleDatesPopover } from "./ScheduleDatesPopover";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

type Project = FunctionReturnType<typeof api.projects.list>[number];

interface UnscheduledProjectsSectionProps {
  projects: Project[];
  stageOf: (projectId: string) => ProjectStage;
  /** The project page (a public slash path). */
  hrefOf: (project: Project) => string;
  onSchedule: (id: Id<"projects">, start: number, end: number) => void;
}

/** Collapsible "No target date" group for projects missing start/end dates.
 *  Each row links to the project and offers a range picker to schedule it onto
 *  the timeline. Uses native <details> so it needs no open/close state. */
export function UnscheduledProjectsSection({
  projects,
  stageOf,
  hrefOf,
  onSchedule,
}: UnscheduledProjectsSectionProps) {
  const navigate = useNavigate();

  if (projects.length === 0) return null;

  return (
    <details className="group shrink-0 rounded-surface bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground max-sm:py-3">
        <IconChevronRight
          size={14}
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        No target date
        <span className="tabular-nums">({projects.length})</span>
      </summary>
      <div className="border-t border-border">
        {projects.map((project) => {
          const config = projectStageConfig[stageOf(project._id)];
          const Icon = config.icon;
          return (
            <div
              key={project._id}
              className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-muted/40 max-sm:py-3"
            >
              <Icon size={14} className={`shrink-0 ${config.text}`} />
              <button
                type="button"
                onClick={() =>
                  navigate({ to: toInternalRepoHref(hrefOf(project)) })
                }
                className="max-sm:hit-target max-sm:min-w-0 flex-1 truncate text-left text-xs font-medium hover:text-primary"
              >
                {project.title}
              </button>
              <ScheduleDatesPopover
                onSchedule={(start, end) => onSchedule(project._id, start, end)}
              />
            </div>
          );
        })}
      </div>
    </details>
  );
}
