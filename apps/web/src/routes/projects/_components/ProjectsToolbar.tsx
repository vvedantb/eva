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
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ToggleSearch,
} from "@vvedantb/ui";
import {
  IconFilter,
  IconLayoutKanban,
  IconList,
  IconPlus,
  IconSettings,
  IconSortDescending,
  IconTimeline,
  IconX,
} from "@tabler/icons-react";
import { PROJECT_SORT_FIELDS, PROJECT_SORT_FIELD_LABELS } from "@eva/shared";
import type { ProjectStage } from "@eva/shared/projectStatus";
import { PROJECT_STAGES } from "@eva/shared/projectView";
import { projectStageConfig } from "@/lib/components/projects/ProjectPhaseBadge";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";
import type { ProjectFilters, ProjectView } from "../_utils";
import { NewProjectButton } from "./NewProjectButton";
import { ProjectsRepoFilter } from "./ProjectsRepoFilter";
import { ProjectsSelectButton } from "./ProjectsSelectButton";

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

/**
 * The overview's header controls: search, view switch, select, repo filter,
 * Options (sort and stages) and New Project.
 */
export function ProjectsToolbar({
  filters,
  setParams,
  hasProjects,
  canSelect,
  onSelect,
  visiblePhases,
  onPhaseToggle,
  hasActiveFilters,
  onClearAll,
  repos,
  filterRepo,
  onFilterRepo,
  onNewProject,
}: {
  filters: ProjectFilters;
  setParams: (patch: Partial<ProjectFilters>) => void;
  hasProjects: boolean;
  canSelect: boolean;
  onSelect: () => void;
  visiblePhases: ReadonlySet<ProjectStage>;
  onPhaseToggle: (stage: ProjectStage) => void;
  hasActiveFilters: boolean;
  onClearAll: () => void;
  repos: ReadonlyArray<RepoWithLogo>;
  filterRepo: RepoWithLogo | null;
  onFilterRepo: (key: string | null) => void;
  onNewProject: (repo: RepoWithLogo) => void;
}) {
  const { q, view, sortField, sortDir } = filters;
  return (
    <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
      <ToggleSearch
        value={q}
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
      {/* The timeline has no rows to check, so selection is not offered there. */}
      <ProjectsSelectButton visible={canSelect} onClick={onSelect} />
      {repos.length > 1 ? (
        <ProjectsRepoFilter
          repos={repos}
          value={filterRepo}
          onChange={onFilterRepo}
        />
      ) : null}
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
                      onCheckedChange={() => onPhaseToggle(p)}
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
                <DropdownMenuItem onSelect={onClearAll}>
                  <IconX size={16} className="mr-2" />
                  Clear all filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <NewProjectButton
        repos={repos}
        filterRepo={filterRepo}
        onPick={onNewProject}
      >
        <IconPlus size={16} aria-hidden />
        <span className="hidden sm:inline">New Project</span>
      </NewProjectButton>
    </div>
  );
}
