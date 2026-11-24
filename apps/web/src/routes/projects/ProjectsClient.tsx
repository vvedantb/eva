import { useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { PageWrapper } from "@/lib/components/PageWrapper";
import {
  Button,
  CenteredSpinner,
  tokenTransition,
  EmptyState,
} from "@vvedantb/ui";
import { IconLayoutKanban, IconPlus } from "@tabler/icons-react";
import { useAccessibleProjects } from "@/lib/components/projects/useProjectStatus";
import {
  PROJECTS_PATH,
  clearedProjectFilter,
  clearedProjectFilters,
  projectHref,
  repoBasePath,
  repoForProjectsFilter,
  searchAndSortProjects,
  projectFilterChips,
  toggleHiddenProjectPhase,
} from "@eva/shared";
import type { ProjectStage } from "@eva/shared/projectStatus";
import { PROJECT_STAGES } from "@eva/shared/projectView";
import { ProjectsTimeline } from "@/lib/components/projects/ProjectsTimeline";
import { ProjectsListView } from "@/lib/components/projects/ProjectsListView";
import { entityPathSegment } from "@/lib/numId";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import { ProjectsKanbanView } from "./_components/ProjectsKanbanView";
import { ProjectDeleteDialog } from "./_components/ProjectDeleteDialog";
import { ProjectsBulkBar } from "./_components/ProjectsBulkBar";
import { useProjectsSelection } from "./_components/useProjectsSelection";
import { useProjectDelete } from "./_components/useProjectDelete";
import { ActiveFiltersBar } from "./_components/ActiveFiltersBar";
import { ProjectsToolbar } from "./_components/ProjectsToolbar";
import {
  NewProjectButton,
  NewProjectDialog,
} from "./_components/NewProjectButton";
import { useProjectFilters, useProjectsRepoFilter } from "./_utils";

/**
 * The root Projects overview: every project in every repo the caller can
 * open, filtered to one repo with `?repo=`.
 */
export function ProjectsClient() {
  const data = useAccessibleProjects();
  const repos = data?.repos ?? [];
  const [repoKey, setRepoKey] = useProjectsRepoFilter();
  const filterRepo = repoForProjectsFilter(repos, repoKey);
  const rows = (data?.rows ?? []).filter(
    ({ repo }) => filterRepo === null || repo._id === filterRepo._id,
  );
  const repoOfProject = new Map(rows.map(({ project, repo }) => [project._id, repo]));
  const projects = data === undefined ? undefined : rows.map((row) => row.project);
  type Project = (typeof rows)[number]["project"];
  const hrefOf = (project: Project): string => {
    const repo = repoOfProject.get(project._id);
    const segment = entityPathSegment(project);
    return repo === undefined || segment === null
      ? PROJECTS_PATH
      : projectHref(repoBasePath(repo), segment);
  };
  const repoLabelOf = (project: Project): string | undefined => {
    const repo = repoOfProject.get(project._id);
    return repo === undefined ? undefined : repoDisplayLabel(repo);
  };
  // Each project's stage is derived from its child tasks, never stored.
  const statuses = data?.statuses;
  const stageOf = (projectId: string): ProjectStage =>
    statuses?.get(projectId)?.stage ?? "todo";
  const [creatingRepo, setCreatingRepo] = useState<RepoWithLogo | null>(null);
  const [filters, setParams] = useProjectFilters();
  const { q, view, hiddenPhases, sortField, sortDir, timelineRange, timelineZoom } =
    filters;
  const searchQuery = q;
  // Derive the visible set from the persisted blocklist so new columns show
  // by default and "all visible" is independent of how many columns exist.
  const hiddenPhaseSet = new Set<ProjectStage>(hiddenPhases);
  const visiblePhases = new Set<ProjectStage>(
    PROJECT_STAGES.filter((c) => !hiddenPhaseSet.has(c)),
  );
  const selection = useProjectsSelection(
    (projects ?? []).map((project) => project._id),
  );
  const exitSelectMode = () => {
    selection.exit();
  };
  const projectDelete = useProjectDelete(exitSelectMode);
  const hasProjects = projects !== undefined && projects.length > 0;

  const filteredSorted = searchAndSortProjects(
    (projects ?? []).filter(
      (project) => !hiddenPhaseSet.has(stageOf(project._id)),
    ),
    { q: searchQuery, sortField, sortDir },
  );

  const projectsByPhaseInitial: Record<ProjectStage, typeof filteredSorted> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  const projectsByPhase = PROJECT_STAGES.reduce((acc, stage) => {
    acc[stage] = filteredSorted.filter((p) => stageOf(p._id) === stage);
    return acc;
  }, projectsByPhaseInitial);

  const hasActiveFilters =
    hiddenPhases.length > 0 || sortField !== "created" || sortDir !== "desc";

  const clearAllFilters = () => {
    setParams(clearedProjectFilters());
  };

  const activeFilterLabels = projectFilterChips(
    { q, hiddenPhases, sortField, sortDir },
    PROJECT_STAGES,
  );

  const clearFilter = (key: string) => {
    const chip = activeFilterLabels.find((filter) => filter.key === key);
    if (chip) setParams(clearedProjectFilter(chip.key));
  };

  const toolbarContent = (
    <ProjectsToolbar
      filters={filters}
      setParams={setParams}
      hasProjects={hasProjects}
      canSelect={hasProjects && view !== "timeline" && !selection.isSelecting}
      onSelect={selection.enter}
      visiblePhases={visiblePhases}
      onPhaseToggle={(stage) =>
        setParams({
          hiddenPhases: toggleHiddenProjectPhase(
            hiddenPhases,
            stage,
            PROJECT_STAGES,
          ),
        })
      }
      hasActiveFilters={hasActiveFilters}
      onClearAll={clearAllFilters}
      repos={repos}
      filterRepo={filterRepo}
      onFilterRepo={(key) => void setRepoKey(key)}
      onNewProject={setCreatingRepo}
    />
  );

  return (
    <>
      <PageWrapper
        title="Projects"
        fillHeight
        childPadding={false}
        headerRight={toolbarContent}
      >
        <div className="relative flex min-w-0 flex-1 min-h-0 flex-col overflow-hidden p-3 pt-0">
          {activeFilterLabels.length > 0 && (
            <ActiveFiltersBar
              filters={activeFilterLabels}
              onClearFilter={clearFilter}
              onClearAll={clearAllFilters}
            />
          )}
          {projects === undefined || statuses === undefined ? (
            <CenteredSpinner label="Loading projects" />
          ) : projects.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState.Root>
                <EmptyState.Icon icon={IconLayoutKanban} size={24} />
                <EmptyState.Title>No projects yet</EmptyState.Title>
                <EmptyState.Description>
                  Create a project to describe a feature and let AI help you
                  break it down into tasks
                </EmptyState.Description>
                <EmptyState.Actions>
                  <div className="mt-6">
                    <NewProjectButton
                      repos={repos}
                      filterRepo={filterRepo}
                      onPick={setCreatingRepo}
                    >
                      <IconPlus size={16} />
                      Create Project
                    </NewProjectButton>
                  </div>
                </EmptyState.Actions>
              </EmptyState.Root>
            </div>
          ) : filteredSorted.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState.Root enter={false}>
                <EmptyState.Icon icon={IconLayoutKanban} size={24} />
                <EmptyState.Title>No matching projects</EmptyState.Title>
                <EmptyState.Description>
                  Try clearing filters to see all projects.
                </EmptyState.Description>
                <EmptyState.Actions>
                  <Button size="sm" onClick={clearAllFilters} className="mt-6">
                    <IconPlus size={16} />
                    Clear filters
                  </Button>
                </EmptyState.Actions>
              </EmptyState.Root>
            </div>
          ) : (
            <AnimatePresence initial={false} mode="wait">
              {view === "kanban" ? (
                <m.div
                  key="projects-kanban-view"
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={tokenTransition.base}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden scrollbar scroll-fade-x snap-x snap-mandatory sm:gap-3 sm:snap-none">
                    <ProjectsKanbanView
                      projectsByPhase={projectsByPhase}
                      visiblePhases={visiblePhases}
                      statuses={statuses}
                      hrefOf={hrefOf}
                      repoLabelOf={repoLabelOf}
                      onDelete={projectDelete.requestSingle}
                      isSelecting={selection.isSelecting}
                      selectedIds={selection.selectedIds}
                      onToggleSelect={selection.toggle}
                    />
                  </div>
                </m.div>
              ) : view === "timeline" ? (
                <m.div
                  key="projects-timeline-view"
                  className="flex flex-1 min-h-0 min-w-0"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={tokenTransition.base}
                >
                  <ProjectsTimeline
                    projects={filteredSorted}
                    stageOf={stageOf}
                    statuses={statuses}
                    hrefOf={hrefOf}
                    range={timelineRange}
                    zoom={timelineZoom}
                    onRangeChange={(r) => setParams({ timelineRange: r })}
                    onZoomChange={(z) => setParams({ timelineZoom: z })}
                  />
                </m.div>
              ) : (
                <m.div
                  key="projects-list-view"
                  className="flex flex-1 min-h-0"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={tokenTransition.base}
                >
                  <ProjectsListView
                    projectsByPhase={projectsByPhase}
                    visiblePhases={visiblePhases}
                    statuses={statuses}
                    hrefOf={hrefOf}
                    repoLabelOf={repoLabelOf}
                    onDelete={projectDelete.requestSingle}
                    isSelecting={selection.isSelecting}
                    selectedIds={selection.selectedIds}
                    onToggleSelect={selection.toggle}
                  />
                </m.div>
              )}
            </AnimatePresence>
          )}
          {hasProjects && (
            <ProjectsBulkBar
              isSelecting={selection.isSelecting}
              selectedCount={selection.selectedIds.size}
              totalCount={filteredSorted.length}
              onExitSelect={exitSelectMode}
              onSelectAll={() =>
                selection.selectAll(filteredSorted.map((p) => p._id))
              }
              onClearSelection={selection.clear}
              onDelete={() =>
                projectDelete.requestBulk([...selection.selectedIds])
              }
            />
          )}
        </div>
      </PageWrapper>
      <NewProjectDialog
        repo={creatingRepo}
        onClose={() => setCreatingRepo(null)}
      />
      <ProjectDeleteDialog
        target={projectDelete.target}
        onClose={projectDelete.close}
        onConfirm={projectDelete.confirm}
        isDeleting={projectDelete.isDeleting}
      />
    </>
  );
}
