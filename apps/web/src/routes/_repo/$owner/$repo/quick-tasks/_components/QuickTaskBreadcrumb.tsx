"use client";

import type { BreadcrumbSwitcherItem } from "@/lib/components/BreadcrumbSwitcher";
import { RepoSectionBreadcrumb } from "@/lib/components/RepoSectionBreadcrumb";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { QuickTask } from "../_utils";

interface QuickTaskBreadcrumbProps {
  onBack: () => void;
  taskId: string;
  tasks: QuickTask[];
  taskNumId?: number;
}

/** Breadcrumb shows only the task number: the title is rendered by TaskHeader below. */
export function QuickTaskBreadcrumb({
  onBack,
  taskId,
  tasks,
  taskNumId,
}: QuickTaskBreadcrumbProps) {
  const { basePath } = useRepo();

  if (taskNumId === undefined) {
    return null;
  }

  const items: BreadcrumbSwitcherItem[] = [...tasks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .flatMap((task) => {
      const segment = entityPathSegment(task);
      if (segment === null) return [];
      return [
        {
          key: task._id,
          prefix: `#${segment}`,
          label: task.title,
          href: toInternalRepoHref(`${basePath}/quick-tasks/${segment}`),
          isActive: task._id === taskId,
        },
      ];
    });

  return (
    <RepoSectionBreadcrumb
      sectionLabel="Quick Tasks"
      onSectionClick={onBack}
      entityLabel={`#${taskNumId}`}
      entitySwitcher={{
        ariaLabel: "Switch quick task",
        emptyLabel: "No quick tasks",
        items,
      }}
    />
  );
}
