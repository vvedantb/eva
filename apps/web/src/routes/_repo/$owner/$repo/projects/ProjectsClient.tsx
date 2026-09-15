import { useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PageWrapper } from "@/lib/components/PageWrapper";
import {
  Button,
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
  motionBase,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { ToggleSearch } from "@/lib/components/ui/ToggleSearch";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { NewProjectModal } from "@/lib/components/projects/NewProjectModal";
import {
  IconLayoutKanban,
  IconPlus,
  IconFilter,
  IconTimeline,
  IconList,
  IconSettings,
  IconSortDescending,
  IconX,
} from "@tabler/icons-react";
import {
  PROJECT_PHASES,
  phaseConfig,
  type ProjectPhase,
} from "@/lib/components/projects/ProjectPhaseBadge";
import { priorityCompare } from "@/lib/components/priority/priorityMeta";
import { ProjectsTimeline } from "@/lib/components/projects/ProjectsTimeline";
import { ProjectsListView } from "@/lib/components/projects/ProjectsListView";
import { ProjectsKanbanView } from "./_components/ProjectsKanbanView";
import { ProjectDeleteDialog } from "./_components/ProjectDeleteDialog";
import {
  ProjectsListSkeleton,
  ProjectsTimelineSkeleton,
} from "./_components/ProjectsSkeletons";
import { ActiveFiltersBar } from "./_components/ActiveFiltersBar";
import { KanbanBoardSkeleton } from "@/lib/components/kanban/KanbanBoardSkeleton";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { requestConfirm, useAltHeld } from "@/lib/confirm";
import {
  useProjectFilters,
  SORT_FIELDS,
  type ProjectView,
  type SortField,
} from "./_utils";

const VIEW_OPTIONS: {
  key: ProjectView;
  icon: typeof IconLayoutKanban;
  label: string;
}[] = [
  { key: "kanban", icon: IconLayoutKanban, label: "Kanban view" },
  { key: "timeline", icon: IconTimeline, label: "Timeline view" },
  { key: "list", icon: IconList, label: "List view" },
];

function isProjectView(value: string): value is ProjectView {
  return value === "kanban" || value === "timeline" || value === "list";
}

const SORT_FIELD_LABELS: Record<SortField, string> = {
  created: "Date Created",
  title: "Title",
  priority: "Priority",
};

export function ProjectsClient() {
  const { repo, basePath, owner, name } = useRepo();
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const deleteProject = useMutation(
    api.projects.deleteCascade,
  ).withOptimisticUpdate((localStore, args) => {
    const currentList = localStore.getQuery(api.projects.list, {
      repoId: repo._id,
    });
    if (currentList !== undefined) {
      localStore.setQuery(
        api.projects.list,
        { repoId: repo._id },
        currentList.filter((p) => p._id !== args.id),
      );
    }
  });
  const [isCreating, setIsCreating] = useState(false);
  const [
    { q, view, hiddenPhases, sortField, sortDir, timelineRange, timelineZoom },
    setParams,
  ] = useProjectFilters();
  const searchQuery = q;
  // Derive the visible set from the persisted blocklist so new phases show by
  // default and "all visible" is independent of how many phases exist.
  const hiddenPhaseSet = new Set<ProjectPhase>(hiddenPhases);
  const visiblePhases = new Set<ProjectPhase>(
    PROJECT_PHASES.filter((p) => !hiddenPhaseSet.has(p)),
  );
  const [projectToDelete, setProjectToDelete] = useState<{
    id: Id<"projects">;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const altHeld = useAltHeld();
  const hasProjects = projects !== undefined && projects.length > 0;

  const filteredSorted = (() => {
    if (!projects) return [];
    const query = searchQuery.toLowerCase().trim();
    return projects
      .filter((p) => {
        if (!visiblePhases.has(p.phase)) return false;
        if (!query) return true;
        return (
          p.title.toLowerCase().includes(query) ||
          p.rawInput?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case "created":
            comparison = a._creationTime - b._creationTime;
            break;
          case "title":
            comparison = a.title.localeCompare(b.title);
            break;
          case "priority":
            comparison = priorityCompare(a.priority, b.priority);
            break;
        }
        return sortDir === "asc" ? comparison : -comparison;
      });
  })();

  const projectsByPhaseInitial: Record<ProjectPhase, typeof filteredSorted> = {
    draft: [],
    finalized: [],
    in_progress: [],
    business_review: [],
    code_review: [],
    completed: [],
    cancelled: [],
  };
  const projectsByPhase = PROJECT_PHASES.reduce((acc, phase) => {
    acc[phase] = filteredSorted.filter((p) => p.phase === phase);
    return acc;
  }, projectsByPhaseInitial);

  const handleDelete = async (target = projectToDelete) => {
    if (!target) return;
    setIsDeleting(true);
    try {
      await withMutationToast(
        deleteProject({ id: target.id }),
        "Project deleted",
        "Couldn't delete project",
        "project-delete",
      );
      setProjectToDelete(null);
    } catch {
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
  };

  const requestDelete = (id: Id<"projects">, title: string) => {
    const target = { id, title };
    requestConfirm(altHeld, () => setProjectToDelete(target), () => {
      void handleDelete(target);
    });
  };

  const handlePhaseToggle = (phase: ProjectPhase) => {
    const hidden = new Set<ProjectPhase>(hiddenPhases);
    if (hidden.has(phase)) {
      hidden.delete(phase);
    } else {
      // Keep at least one phase visible.
      if (visiblePhases.size === 1) return;
      hidden.add(phase);
    }
    setParams({ hiddenPhases: [...hidden] });
  };

  const hasActiveFilters =
    hiddenPhases.length > 0 || sortField !== "created" || sortDir !== "desc";

  const clearAllFilters = () => {
    setParams({
      hiddenPhases: [],
      sortField: "created",
      sortDir: "desc",
    });
  };

  const activeFilterLabels: Array<{ key: string; label: string }> = [];
  if (hiddenPhases.length > 0) {
    activeFilterLabels.push({
      key: "phases",
      label: `${visiblePhases.size} Phase${visiblePhases.size !== 1 ? "s" : ""}`,
    });
  }
  if (sortField !== "created") {
    activeFilterLabels.push({
      key: "sortField",
      label: `Sort: ${SORT_FIELD_LABELS[sortField]}`,
    });
  }
  if (sortDir !== "desc") {
    activeFilterLabels.push({ key: "sortDir", label: "Ascending" });
  }

  const clearFilter = (key: string) => {
    switch (key) {
      case "phases":
        setParams({ hiddenPhases: [] });
        break;
      case "sortField":
        setParams({ sortField: "created" });
        break;
      case "sortDir":
        setParams({ sortDir: "desc" });
        break;
    }
  };

  const toolbarContent = (
    <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
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
          {/* Taller below `sm` so the icon-only triggers clear the tap floor;
              `hit-target` is no use inside the list's own overflow clip. */}
          <TabsList className="tabs-segmented h-8 max-sm:h-10">
            {VIEW_OPTIONS.map((opt) => (
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
                Sort: {SORT_FIELD_LABELS[sortField]}{" "}
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
                  {SORT_FIELDS.map((f) => (
                    <DropdownMenuRadioItem key={f} value={f}>
                      {SORT_FIELD_LABELS[f]}
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
                {visiblePhases.size === PROJECT_PHASES.length
                  ? "All Phases"
                  : `${visiblePhases.size} Phases`}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {PROJECT_PHASES.map((p) => {
                  const cfg = phaseConfig[p];
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
      <Button
        size="sm"
        aria-label="New project"
        className="motion-press hover:scale-[1.01] active:scale-[0.96]"
        onClick={() => setIsCreating(true)}
      >
        <IconPlus size={16} aria-hidden />
        <span className="hidden sm:inline">New Project</span>
      </Button>
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
          {projects === undefined ? (
            view === "kanban" ? (
              <KanbanBoardSkeleton
                columns={
                  visiblePhases.size > 0
                    ? visiblePhases.size
                    : PROJECT_PHASES.length
                }
                aria-label="Loading projects"
              />
            ) : view === "timeline" ? (
              <ProjectsTimelineSkeleton />
            ) : (
              <ProjectsListSkeleton />
            )
          ) : projects.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState
                icon={
                  <IconLayoutKanban
                    size={24}
                    className="text-muted-foreground"
                  />
                }
                title="No projects yet"
                description="Create a project to describe a feature and let AI help you break it down into tasks"
                actionLabel="Create Project"
                onAction={() => setIsCreating(true)}
              />
            </div>
          ) : filteredSorted.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState
                icon={
                  <IconLayoutKanban
                    size={24}
                    className="text-muted-foreground"
                  />
                }
                title="No matching projects"
                description="Try clearing filters to see all projects."
                actionLabel="Clear filters"
                onAction={clearAllFilters}
                animate={false}
              />
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
                  transition={motionBase}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden scrollbar scroll-fade-x snap-x snap-mandatory sm:gap-3 sm:snap-none">
                    <ProjectsKanbanView
                      projectsByPhase={projectsByPhase}
                      visiblePhases={visiblePhases}
                      owner={owner}
                      name={name}
                      basePath={basePath}
                      onDelete={requestDelete}
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
                  transition={motionBase}
                >
                  <ProjectsTimeline
                    projects={filteredSorted}
                    basePath={basePath}
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
                  transition={motionBase}
                >
                  <ProjectsListView
                    projectsByPhase={projectsByPhase}
                    visiblePhases={visiblePhases}
                    onDelete={requestDelete}
                  />
                </m.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </PageWrapper>
      <NewProjectModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />
      <ProjectDeleteDialog
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={() => handleDelete()}
        isDeleting={isDeleting}
      />
    </>
  );
}
