"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { BreadcrumbSwitcherItem } from "@/lib/components/BreadcrumbSwitcher";
import { RepoSectionBreadcrumb } from "@/lib/components/RepoSectionBreadcrumb";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

interface ProjectBreadcrumbProps {
  projectId: Id<"projects">;
  title: string;
}

/** `Projects > <name>`, where the leaf switches between the repo's projects. */
export function ProjectBreadcrumb({
  projectId,
  title,
}: ProjectBreadcrumbProps) {
  const navigate = useNavigate();
  const { basePath, repo } = useRepo();
  const projects = useQuery(api.projects.list, { repoId: repo._id });

  const items: BreadcrumbSwitcherItem[] = [...(projects ?? [])]
    .sort(
      (a, b) =>
        (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
    )
    .flatMap((project) => {
      const segment = entityPathSegment(project);
      if (segment === null) return [];
      return [
        {
          key: project._id,
          label: project.title,
          href: toInternalRepoHref(`${basePath}/projects/${segment}`),
          isActive: project._id === projectId,
        },
      ];
    });

  return (
    <RepoSectionBreadcrumb
      sectionLabel="Projects"
      onSectionClick={() => navigate({ to: toInternalRepoHref(`${basePath}/projects`) })}
      entityLabel={title}
      entitySwitcher={{
        ariaLabel: "Switch project",
        emptyLabel: "No projects",
        items,
      }}
    />
  );
}
