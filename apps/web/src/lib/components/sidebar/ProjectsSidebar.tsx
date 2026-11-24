"use client";

import { Link } from "@tanstack/react-router";
import { CenteredSpinner, CountPop, countLabel } from "@vvedantb/ui";
import { projectHref, repoBasePath } from "@eva/shared";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
  sidebarSectionLabelClass,
} from "@/lib/components/sidebar/SharedLayoutNav";
import { repoBasePaths } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { useAccessibleProjects } from "@/lib/components/projects/useProjectStatus";
import { entityPathSegment } from "@/lib/numId";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

type ProjectsData = NonNullable<ReturnType<typeof useAccessibleProjects>>;
type ProjectEntry = ProjectsData["rows"][number];

interface ProjectsSidebarProps {
  pathname: string;
  onNavigate: () => void;
}

/**
 * The column beside a project page, in place of the app sidebar: every
 * project the caller can open, active ones first, then Done. Each row shows
 * its home repo and how many tasks wait in Triage.
 */
export function ProjectsSidebar({ pathname, onNavigate }: ProjectsSidebarProps) {
  const data = useAccessibleProjects();
  if (data === undefined) {
    return <CenteredSpinner label="Loading projects" className="min-h-48" />;
  }
  const done = data.rows.filter(
    ({ project }) => data.statuses.get(project._id)?.stage === "done",
  );
  const active = data.rows.filter(
    ({ project }) => data.statuses.get(project._id)?.stage !== "done",
  );
  const rowProps = { data, pathname, onNavigate };

  return (
    <SharedLayoutNav layoutId="projects-sidebar" className="space-y-4">
      <div className="space-y-1">
        {active.map((entry) => (
          <ProjectsSidebarRow key={entry.project._id} entry={entry} {...rowProps} />
        ))}
      </div>
      {done.length > 0 ? (
        <div>
          <p className={sidebarSectionLabelClass}>Done</p>
          <div className="space-y-1">
            {done.map((entry) => (
              <ProjectsSidebarRow key={entry.project._id} entry={entry} {...rowProps} />
            ))}
          </div>
        </div>
      ) : null}
    </SharedLayoutNav>
  );
}

function ProjectsSidebarRow({
  entry: { project, repo },
  data,
  pathname,
  onNavigate,
}: {
  entry: ProjectEntry;
  data: ProjectsData;
  pathname: string;
  onNavigate: () => void;
}) {
  const segment = entityPathSegment(project);
  if (segment === null) return null;
  // Both URL forms: `location.pathname` is the router-internal one.
  const isActive = repoBasePaths(repo).some((base) => {
    const href = projectHref(base, segment);
    return pathname === href || pathname.startsWith(`${href}/`);
  });
  const triage = data.statuses.get(project._id)?.counts.triage;

  return (
    <SharedLayoutNavSurface itemId={project._id} isActive={isActive}>
      <Link
        to={toInternalRepoHref(projectHref(repoBasePath(repo), segment))}
        onClick={onNavigate}
        className={sidebarNavLinkClass(isActive)}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{project.title}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {repoDisplayLabel(repo)}
          </span>
        </span>
        <CountPop
          label={countLabel(triage)}
          className="shrink-0 px-1.5 py-0 text-2xs font-medium tabular-nums text-muted-foreground"
        />
      </Link>
    </SharedLayoutNavSurface>
  );
}
