import { cn } from "@eva/ui";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import { PROJECT_TASK_DISPLAY_STATUSES } from "@eva/shared/projectView";
import { projectTaskDisplayStatusConfig } from "./ProjectPhaseBadge";

/**
 * The project's task counts by display status ("2 Working · 1 Blocked"),
 * from live data, in the task list groups' looks. Empty statuses are left
 * out; nothing renders without tasks.
 */
export function ProjectStageCounts({
  status,
  className,
}: {
  status: Pick<ProjectStatus, "counts"> | undefined;
  className?: string;
}) {
  const shown = PROJECT_TASK_DISPLAY_STATUSES.filter(
    (displayStatus) => (status?.counts[displayStatus] ?? 0) > 0,
  );
  if (!status || shown.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs tabular-nums",
        className,
      )}
    >
      {shown.map((displayStatus) => {
        const config = projectTaskDisplayStatusConfig[displayStatus];
        const Icon = config.icon;
        return (
          <span
            key={displayStatus}
            className={cn("flex items-center gap-1", config.text)}
          >
            <Icon size={12} aria-hidden />
            {status.counts[displayStatus]} {config.label}
          </span>
        );
      })}
    </div>
  );
}
