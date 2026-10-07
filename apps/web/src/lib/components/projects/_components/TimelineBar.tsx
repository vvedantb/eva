"use client";

import type { FunctionReturnType } from "convex/server";
import { type api } from "@eva/backend";
import { Tooltip, TooltipTrigger, TooltipContent } from "@eva/ui";
import {
  phaseConfig,
  type ProjectPhase,
} from "@/lib/components/projects/ProjectPhaseBadge";
import {
  statusConfig,
  TASK_STATUSES,
} from "@/lib/components/tasks/TaskStatusBadge";

type ProjectProgress = FunctionReturnType<
  typeof api.projects.listTaskProgress
>[number];

interface TimelineBarProps {
  name: string;
  phase: ProjectPhase;
  progress?: ProjectProgress;
}

/**
 * The inner content of a timeline bar: a phase-tinted track, a saturated fill
 * sized to the share of completed tasks (Linear-style), the project name and a
 * percentage. Wrapped in a tooltip with the full per-status breakdown. Purely
 * presentational — progress is fed in so the row issues no query of its own.
 */
export function TimelineBar({ name, phase, progress }: TimelineBarProps) {
  const config = phaseConfig[phase];
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

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
        {total > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">
              {done}/{total} tasks done · {pct}%
            </span>
            {TASK_STATUSES.flatMap((s) => {
              if ((progress?.[s] ?? 0) <= 0) return [];
              const Icon = statusConfig[s].icon;
              return [
                <span
                  key={s}
                  className={`flex items-center gap-1.5 text-xs ${statusConfig[s].text}`}
                >
                  <Icon size={12} /> {progress?.[s]} {statusConfig[s].label}
                </span>,
              ];
            })}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No tasks yet</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
