"use client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@vvedantb/ui";
import type { ProjectStage, ProjectStatus } from "@eva/shared/projectStatus";
import { projectArchivedShare } from "@eva/shared/projectView";
import { projectStageConfig } from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectStageCounts } from "@/lib/components/projects/ProjectStageCounts";

interface TimelineBarProps {
  name: string;
  stage: ProjectStage;
  counts?: ProjectStatus["counts"];
}

/**
 * The inner content of a timeline bar: a stage-tinted track, a saturated fill
 * sized to the share of archived tasks (Linear-style), the project name and a
 * percentage. Wrapped in a tooltip with the counts by display status. Purely
 * presentational — counts are fed in so the row issues no query of its own.
 */
export function TimelineBar({ name, stage, counts }: TimelineBarProps) {
  const config = projectStageConfig[stage];
  const { archived, total, percent: pct } = counts
    ? projectArchivedShare(counts)
    : { archived: 0, total: 0, percent: 0 };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative flex h-full w-full items-center gap-1.5 px-2">
          <div className={`absolute inset-0 ${config.bg}`} />
          <div
            className={`absolute inset-0 origin-left opacity-80 transition-transform duration-[var(--motion-slow)] ${config.bar}`}
            style={{ transform: `scaleX(${pct / 100})` }}
          />
          <span
            className={`relative z-1 truncate text-2xs font-medium ${config.text}`}
          >
            {name}
          </span>
          {total > 0 && (
            <span
              className={`relative z-1 ml-auto shrink-0 text-3xs font-semibold tabular-nums ${config.text}`}
            >
              {pct}%
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {counts && total > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">
              {archived}/{total} tasks archived · {pct}%
            </span>
            <ProjectStageCounts status={{ counts }} className="text-xs" />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No tasks yet</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
