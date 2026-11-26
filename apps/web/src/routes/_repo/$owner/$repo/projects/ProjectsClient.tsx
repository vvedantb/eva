import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PageWrapper } from "@/lib/components/PageWrapper";
import {
  Button,
  CenteredSpinner,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  TabsTransition,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  EmptyState,
  ToggleSearch,
} from "@vvedantb/ui";
import { NewProjectModal } from "@/lib/components/projects/NewProjectModal";
import {
  IconArchive,
  IconLayoutKanban,
  IconPlus,
  IconFilter,
  IconTimeline,
  IconList,
  IconSettings,
  IconSortDescending,
  IconX,
} from "@tabler/icons-react";
import { projectStageConfig } from "@/lib/components/projects/ProjectPhaseBadge";
import { useProjectListStatuses } from "@/lib/components/projects/useProjectStatus";
import {
  PROJECT_SORT_FIELDS,
  PROJECT_SORT_FIELD_LABELS,
  clearedProjectFilter,
  clearedProjectFilters,
  searchAndSortProjects,
  projectFilterChips,
  toggleHiddenProjectPhase,
  archiveCopy,
  type ArchiveListMode,
} from "@eva/shared";
import type { ProjectStage } from "@eva/shared/projectStatus";
import { PROJECT_STAGES } from "@eva/shared/projectView";
import { ProjectsTimeline } from "@/lib/components/projects/ProjectsTimeline";
import { ProjectsListView } from "@/lib/components/projects/ProjectsListView";
import { ProjectsKanbanView } from "./_components/ProjectsKanbanView";
import { ProjectArchiveDialog } from "./_components/ProjectArchiveDialog";
import { ProjectsSelectButton } from "./_components/ProjectsSelectButton";
import { ProjectsBulkBar } from "./_components/ProjectsBulkBar";
import { useProjectsSelection } from "./_components/useProjectsSelection";
import { useProjectArchive } from "./_components/useProjectArchive";
import { ListModeTabs } from "@/lib/components/ListModeTabs";
import { ActiveFiltersBar } from "./_components/ActiveFiltersBar";
import { useProjectFilters, type ProjectView } from "./_utils";

const VIEW_OPTIONS: {
  key: ProjectView;
  icon: typeof IconLayoutKanban;
  label: string;
}[] = [
  { key: "kanban", icon: IconLayoutKanban, label: "Kanban view" },
  { key: "timeline", icon: IconTimeline, label: "Timeline view" },
  { key: "list", icon: IconList, label: "List view" },
];

const PROJECT_VIEW_ORDER = VIEW_OPTIONS.map((opt) => opt.key);

const PROJECT_VIEW_PANEL_CLASS: Record<ProjectView, string> = {
  kanban: "flex min-h-0 min-w-0 flex-1 flex-col",
  timeline: "flex flex-1 min-h-0 min-w-0",
  list: "flex flex-1 min-h-0",
};

function isProjectView(value: string): value is ProjectView {
  return VIEW_OPTIONS.some((opt) => opt.key === value);
}

export function ProjectsClient() {
  const { repo, basePath, owner, name } = useRepo();
  const [listMode, setListMode] = useState<ArchiveListMode>("active");
  const isArchivedList = listMode === "archived";
  const liveProjects = useQuery(
    api.projects.list,
    isArchivedList ? "skip" : { repoId: repo._id },
  );
  const archivedProjects = useQuery(
    api.projects.listArchived,
    isArchivedList ? { repoId: repo._id } : "skip",
  );
  const projects = isArchivedList ? archivedProjects : liveProjects;
  const statuses = useProjectListStatuses(repo._id, isArchivedList);
  const stageOf = (projectId: string): ProjectStage =>
    statuses?.get(projectId)?.stage ?? "todo";
  const [isCreating, setIsCreating] = useState(false);
  const [
    {
      q,
      view: savedView,
      hiddenPhases,
      sortField,
      sortDir,
      timelineRange,
      timelineZoom,
    },
    setParams,
  ] = useProjectFilters();
  const view = isArchivedList && savedView === "timeline" ? "list" : savedView;
  const viewOptions = isArchivedList
    ? VIEW_OPTIONS.filter((opt) => opt.key !== "timeline")
    : VIEW_OPTIONS;
  const searchQuery = q;
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
  const projectArchive = useProjectArchive(repo._id, exitSelectMode);
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

  const handlePhaseToggle = (stage: ProjectStage) => {
    setParams({
      hiddenPhases: toggleHiddenProjectPhase(
        hiddenPhases,
        stage,
        PROJECT_STAGES,
      ),
    });
  };

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
    <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
      <ListModeTabs
        mode={listMode}
        onChange={(mode) => {
          exitSelectMode();
          setListMode(mode);
        }}
        className="w-40"
      />
      <ToggleSearch
        value={searchQuery}
        onChange={(v) => setParams({ q: v ?? "" })}
        placeholder="Search projects..."
        visible={hasProjects}
        variant="large"
      />
      {hasProjects && (
        <Tabs
          value={view}
          onValueChange={(value) => {
            if (isProjectView(value)) setParams({ view: value });
          }}
        >
          <TabsList className="tabs-segmented h-8 max-sm:h-10">
            {viewOptions.map((opt) => (
              <Tooltip key={opt.key}>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value={opt.key}
                    aria-label={opt.label}
                    className="px-2.5 py-1 max-sm:px-3"
                  >
                    <opt.icon size={16} aria-hidden />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>{opt.label}</TooltipContent>
              </Tooltip>
            ))}
          </TabsList>
        </Tabs>
      )}
      <ProjectsSelectButton
        visible={
          hasProjects &&
          view !== "timeline" &&
          !selection.isSelecting &&
          !isArchivedList
        }
        onClick={selection.enter}
      />
      {hasProjects && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              aria-label="View options"
              className="motion-press hover:scale-[1.01] active:scale-[0.96]"
            >
              <IconSettings size={16} aria-hidden />
              <span className="hidden sm:inline">Options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IconSortDescending size={16} className="mr-2" />
                Sort: {PROJECT_SORT_FIELD_LABELS[sortField]}{" "}
                {sortDir === "asc" ? "↑" : "↓"}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={sortField}
                  onValueChange={(v) => {
                    if (v === "created" || v === "title" || v === "priority") {
                      setParams({ sortField: v });
                    }
                  }}
                >
                  {PROJECT_SORT_FIELDS.map((f) => (
                    <DropdownMenuRadioItem key={f} value={f}>
                      {PROJECT_SORT_FIELD_LABELS[f]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={sortDir}
                  onValueChange={(v) => {
                    if (v === "asc" || v === "desc") {
                      setParams({ sortDir: v });
                    }
                  }}
                >
                  <DropdownMenuRadioItem value="desc">
                    Descending ↓
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="asc">
                    Ascending ↑
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IconFilter size={16} className="mr-2" />
                {visiblePhases.size === PROJECT_STAGES.length
                  ? "All Phases"
                  : `${visiblePhases.size} Phases`}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {PROJECT_STAGES.map((p) => {
                  const cfg = projectStageConfig[p];
                  return (
                    <DropdownMenuCheckboxItem
                      key={p}
                      checked={visiblePhases.has(p)}
                      onCheckedChange={() => handlePhaseToggle(p)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <cfg.icon size={16} className={cfg.text + " mr-2"} />
                      <span className={cfg.text}>{cfg.label}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {hasActiveFilters && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={clearAllFilters}>
                  <IconX size={16} className="mr-2" />
                  Clear all filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isArchivedList ? null : (
        <Button
          size="sm"
          aria-label="New project"
          className="motion-press hover:scale-[1.01] active:scale-[0.96]"
          onClick={() => setIsCreating(true)}
        >
          <IconPlus size={16} aria-hidden />
          <span className="hidden sm:inline">New Project</span>
        </Button>
      )}
    </div>
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
          ) : projects.length === 0 && isArchivedList ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState.Root>
                <EmptyState.Icon icon={IconArchive} size={24} />
                <EmptyState.Title>
                  {archiveCopy("project").emptyArchived}
                </EmptyState.Title>
              </EmptyState.Root>
            </div>
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
                  <Button
                    size="sm"
                    onClick={() => setIsCreating(true)}
                    className="mt-6"
                  >
                    <IconPlus size={16} />
                    Create Project
                  </Button>
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
            <TabsTransition
              value={view}
              order={PROJECT_VIEW_ORDER}
              className="flex min-h-0 min-w-0 flex-1"
              panelClassName={PROJECT_VIEW_PANEL_CLASS[view]}
            >
              {view === "kanban" ? (
                <div className="flex h-full min-h-0 min-w-0 flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden scrollbar scroll-fade-x snap-x snap-mandatory sm:gap-3 sm:snap-none">
                  <ProjectsKanbanView
                    projectsByPhase={projectsByPhase}
                    visiblePhases={visiblePhases}
                    statuses={statuses}
                    owner={owner}
                    name={name}
                    basePath={basePath}
                    onArchive={projectArchive.requestSingle}
                    isSelecting={selection.isSelecting}
                    selectedIds={selection.selectedIds}
                    onToggleSelect={selection.toggle}
                  />
                </div>
              ) : view === "timeline" ? (
                <ProjectsTimeline
                  projects={filteredSorted}
                  stageOf={stageOf}
                  statuses={statuses}
                  basePath={basePath}
                  range={timelineRange}
                  zoom={timelineZoom}
                  onRangeChange={(r) => setParams({ timelineRange: r })}
                  onZoomChange={(z) => setParams({ timelineZoom: z })}
                />
              ) : (
                <ProjectsListView
                  projectsByPhase={projectsByPhase}
                  visiblePhases={visiblePhases}
                  statuses={statuses}
                  onArchive={projectArchive.requestSingle}
                  isSelecting={selection.isSelecting}
                  selectedIds={selection.selectedIds}
                  onToggleSelect={selection.toggle}
                />
              )}
            </TabsTransition>
          )}
          {hasProjects && !isArchivedList && (
            <ProjectsBulkBar
              isSelecting={selection.isSelecting}
              selectedCount={selection.selectedIds.size}
              totalCount={filteredSorted.length}
              onExitSelect={exitSelectMode}
              onSelectAll={() =>
                selection.selectAll(filteredSorted.map((p) => p._id))
              }
              onClearSelection={selection.clear}
              onArchive={() =>
                projectArchive.requestBulk([...selection.selectedIds])
              }
            />
          )}
        </div>
      </PageWrapper>
      <NewProjectModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />
      <ProjectArchiveDialog
        target={projectArchive.target}
        onClose={projectArchive.close}
        onConfirm={projectArchive.confirm}
        isArchiving={projectArchive.isArchiving}
      />
    </>
  );
}
