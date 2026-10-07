"use client";

import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";
import { AvatarStack, Tooltip, TooltipTrigger, TooltipContent } from "@eva/ui";
import { UserInitials } from "@eva/shared/user-initials";

type ProjectProgress = FunctionReturnType<
  typeof api.projects.listTaskProgress
>[number];

interface TimelineSidebarMetaProps {
  progress?: ProjectProgress;
  lead?: Id<"users">;
  members?: Id<"users">[];
  /** Shown when a project has neither a lead nor members. */
  fallbackUserId: Id<"users">;
}

const MAX_AVATARS = 2;

/** Linear-style circular progress ring (donut). Track + accent arc for the
 *  completed share; an empty track when there are no tasks. */
function ProgressRing({ pct }: { pct: number }) {
  const size = 14;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgb(var(--border))"
        strokeWidth={stroke}
      />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--primary))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      )}
    </svg>
  );
}

/** Trailing content for a timeline sidebar row: a completion ring + the
 *  lead/member avatars. Presentational; progress is supplied by the parent. */
export function TimelineSidebarMeta({
  progress,
  lead,
  members,
  fallbackUserId,
}: TimelineSidebarMetaProps) {
  const ids = [
    ...new Set(
      [lead, ...(members ?? [])].filter(
        (id): id is Id<"users"> => id !== undefined,
      ),
    ),
  ];
  const all = ids.length > 0 ? ids : [fallbackUserId];
  const shown = all.slice(0, MAX_AVATARS);
  const hidden = all.length - shown.length;

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center">
            <ProgressRing pct={pct} />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {total > 0 ? `${done}/${total} tasks done · ${pct}%` : "No tasks yet"}
        </TooltipContent>
      </Tooltip>
      <AvatarStack size={18} className="-space-x-1">
        {shown.map((id) => (
          <UserInitials key={id} userId={id} hideLastSeen />
        ))}
      </AvatarStack>
      {hidden > 0 && (
        <span className="text-[10px] font-medium leading-none text-muted-foreground">
          +{hidden}
        </span>
      )}
    </div>
  );
}
