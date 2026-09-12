"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Tooltip, TooltipTrigger, TooltipContent } from "@eva/ui";
import {
  statusConfig,
  TASK_STATUSES,
} from "@/lib/components/tasks/TaskStatusBadge";

interface ProjectProgressBarProps {
  projectId: Id<"projects">;
  className?: string;
}

export function ProjectProgressBar({
  projectId,
  className,
}: ProjectProgressBarProps) {
  const progress = useQuery(api.projects.getTaskProgress, { projectId });

  if (!progress) return null;

  if (progress.total === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`h-1.5 overflow-hidden rounded-full bg-secondary/85 ${className ?? ""}`}
          />
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs text-muted-foreground">No tasks yet</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Fills stay at full track width and scale from the left — same compositor
  // rule as UsageBar. `.project-progress-fill` is the hook for
  // `html[data-page-motion=off]` (do not add that rule here).
  const segments: {
    status: (typeof TASK_STATUSES)[number];
    ratio: number;
    offset: number;
  }[] = [];
  let offset = 0;
  for (const status of TASK_STATUSES) {
    const count = progress[status];
    if (count === 0) continue;
    const ratio = count / progress.total;
    segments.push({ status, ratio, offset });
    offset += ratio;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative h-1.5 overflow-hidden rounded-full bg-secondary ${className ?? ""}`}
        >
          {segments.map((segment) => (
            <div
              key={segment.status}
              className={`project-progress-fill absolute inset-y-0 w-full origin-left transition-transform duration-[var(--motion-base)] ${statusConfig[segment.status].bar}`}
              style={{
                left: `${segment.offset * 100}%`,
                transform: `scaleX(${segment.ratio})`,
              }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-1">
          {TASK_STATUSES.flatMap((s) => {
            if (progress[s] <= 0) return [];
            const Icon = statusConfig[s].icon;
            return [
              <span
                key={s}
                className={`flex items-center gap-1.5 ${statusConfig[s].text}`}
              >
                <Icon size={12} /> {progress[s]} {statusConfig[s].label}
              </span>,
            ];
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
