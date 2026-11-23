"use client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@vvedantb/ui";
import type {
  ProjectStage,
  ProjectTaskStage,
} from "@eva/shared/projectStatus";
import { projectLaunchedShare } from "@eva/shared/projectView";
import { projectStageConfig } from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectStageCounts } from "@/lib/components/projects/ProjectStageCounts";

interface TimelineBarProps {
  name: string;
  stage: ProjectStage;
  /** Task counts by derived stage (`listStatusesForRepo`). */
  counts?: Record<ProjectTaskStage, number>;
}

/**
 * The inner content of a timeline bar: a stage-tinted track, a saturated fill
 * sized to the share of launched tasks (Linear-style), the project name and a
 * percentage. Wrapped in a tooltip with the counts by derived stage. Purely
 * presentational — counts are fed in so the row issues no query of its own.
 */
export function TimelineBar({ name, stage, counts }: TimelineBarProps) {
  const config = projectStageConfig[stage];
  const { launched, total, percent: pct } = counts
    ? projectLaunchedShare(counts)
    : { launched: 0, total: 0, percent: 0 };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative flex h-full w-full items-center gap-1.5 px-2">
          <div className={`absolute inset-0 ${config.bg}`} />
          {/* Full-width layer scaled from the left edge rather than sized by
              `width`, which relayouted the row on every frame. Always mounted so
              the first value scales up from nothing instead of popping in. */}
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
              {launched}/{total} tasks launched · {pct}%
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
