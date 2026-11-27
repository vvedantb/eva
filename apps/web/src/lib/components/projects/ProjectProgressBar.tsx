"use client";

import { cn } from "@eva/ui";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import { projectStatusSegments } from "@eva/shared/projectView";
import { Tooltip, TooltipTrigger, TooltipContent } from "@vvedantb/ui";
import { projectTaskDisplayStatusConfig } from "./ProjectPhaseBadge";
import { ProjectStageCounts } from "./ProjectStageCounts";

interface ProjectProgressBarProps {
  status: Pick<ProjectStatus, "counts"> | undefined;
  className?: string;
}

export function ProjectProgressBar({
  status,
  className,
}: ProjectProgressBarProps) {
  if (!status) return null;

  // Fills stay at full track width and scale from the left — same compositor
  // rule as UsageBar. The global `html[data-page-motion=off]` rule snaps it.
  const segments = projectStatusSegments(status);

  if (segments.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "h-1.5 overflow-hidden rounded-full bg-secondary/85",
              className,
            )}
          />
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs text-muted-foreground">No tasks yet</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "relative h-1.5 overflow-hidden rounded-full bg-secondary",
            className,
          )}
        >
          {segments.map((segment) => (
            <div
              key={segment.status}
              className={`project-progress-fill absolute inset-y-0 w-full origin-left transition-transform duration-[var(--motion-base)] ${projectTaskDisplayStatusConfig[segment.status].bar}`}
              style={{
                left: `${segment.offset * 100}%`,
                transform: `scaleX(${segment.ratio})`,
              }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <ProjectStageCounts
          status={status}
          className="flex-col items-start gap-1 text-xs"
        />
      </TooltipContent>
    </Tooltip>
  );
}
