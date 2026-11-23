import { cn } from "@eva/ui";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import { PROJECT_STAGE_COUNT_ORDER } from "@eva/shared/projectView";
import { projectTaskStageConfig } from "./ProjectPhaseBadge";

/**
 * The project's task counts by derived stage ("2 Launched · 1 In Review"),
 * from live data. Empty stages are left out; nothing renders without tasks.
 */
export function ProjectStageCounts({
  status,
  className,
}: {
  status: ProjectStatus | undefined;
  className?: string;
}) {
  const shown = PROJECT_STAGE_COUNT_ORDER.filter(
    (stage) => (status?.counts[stage] ?? 0) > 0,
  );
  if (!status || shown.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs tabular-nums",
        className,
      )}
    >
      {shown.map((stage) => {
        const config = projectTaskStageConfig[stage];
        const Icon = config.icon;
        return (
          <span
            key={stage}
            className={cn("flex items-center gap-1", config.text)}
          >
            <Icon size={12} aria-hidden />
            {status.counts[stage]} {config.label}
          </span>
        );
      })}
    </div>
  );
}
