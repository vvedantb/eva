import { api } from "@eva/backend";
import {
  ARCHIVE_LIST_MODES,
  ARCHIVE_LIST_MODE_LABELS,
  PROJECT_LIST_DEFAULTS,
  archiveCopy,
  PROJECT_SORT_FIELDS,
  PROJECT_SORT_FIELD_LABELS,
  clearedProjectFilter,
  clearedProjectFilters,
  projectFilterChips,
  searchAndSortProjects,
  toggleHiddenProjectPhase,
  type ArchiveListMode,
  type ProjectListFilters,
} from "@eva/shared";
import type { ProjectStage } from "@eva/shared/projectStatus";
import { PROJECT_STAGES, PROJECT_STAGE_LABELS } from "@eva/shared/projectView";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconFilter, IconLayoutKanban, IconPlus, IconSettings, IconSortDescending, IconX } from "@tabler/icons-react-native";
import { tabBarReserve } from "@vvedantb/native-ui/floating";
import { Button, EmptyState, SheetRow, SkeletonList, SkeletonRow, MenuDivider, MenuSheet, SubmenuRow } from "@vvedantb/native-ui/primitives";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { projectStageAppearance } from "@/projects/phaseAppearance";
import { ProjectRow } from "@/projects/ProjectRow";
import { useProjectActions } from "@/projects/useProjectActions";
import { useProjectListStatuses } from "@/projects/useProjectStatus";
import { CardGap, FoldFooter, FoldHeader } from "@/ui/FoldHeader";
import { FilterChipsBar } from "@/ui/FilterChipsBar";
import { persistedIdSet } from "@/storage/persistedStore";
import { RepoPicker, useRepoParam } from "@/ui/RepoPicker";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

type StageListFilters = Omit<ProjectListFilters, "hiddenPhases"> & { hiddenPhases: ProjectStage[] };

const STAGE_LIST_DEFAULTS: StageListFilters = { ...PROJECT_LIST_DEFAULTS, hiddenPhases: [] };

const toggledProjectPhases = persistedIdSet("projectPhasesToggled");

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

/** The Projects repo (`useRepoParam`), and the new-project screen on it. */
export function useProjectRepo() {
  const router = useRouter();
  const { repos, repo, setRepo } = useRepoParam();
  return {
    repos,
    repo,
    setRepo,
    openNew: () => router.push(repo ? { pathname: "/project/new", params: { repoId: repo._id } } : "/project/new"),
  };
}

/**
 * The web Projects list view at phone width, for one repo: the repo picker,
 * the toolbar (search and the Options sheet: sort and stages, the web
 * `ProjectsClient` toolbar) and its "Filtered by" chips, then a collapsible
 * section per shown derived stage (`projectStatus`: To Do, In Progress,
 * Done; icon, label, count; `listStatusesForRepo`), each with its
 * project cards or "No projects". Sections with projects start open, as the
 * web. A long press on a card opens the web project menu as a sheet
 * (`useProjectActions`). An Active / Archived switch, as the sessions list,
 * shows the archived projects (`projects.listArchived`) instead. A `SectionList`, as a repo's projects have no cap.
 * Not here from the web: the kanban and timeline views, select mode and its
 * bulk bar.
 */
export function ProjectsSection() {
  const { repos, repo, setRepo } = useProjectRepo();
  if (repos === undefined) return <ProjectPlaceholders />;
  if (!repo) {
    return <EmptyState icon={IconLayoutKanban} title="No repos" description="Connect a repo on the web. It shows up here." />;
  }
  return (
    <View className="flex-1">
      <View className="px-4">
        <RepoPicker repos={repos} value={repo} onChange={setRepo} />
      </View>
      <ProjectList key={repo._id} repo={repo} />
    </View>
  );
}

const PROJECT_LIST_QUERIES = {
  active: api.projects.list,
  archived: api.projects.listArchived,
};

const MODE_OPTIONS = ARCHIVE_LIST_MODES.map((value) => ({ value, label: ARCHIVE_LIST_MODE_LABELS[value] }));

function ProjectList({ repo }: { repo: Repo }) {
  const [mode, setMode] = useState<ArchiveListMode>("active");
  return (
    <View className="flex-1">
      <View className="px-4 pb-2">
        <SegmentedTabs value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </View>
      <ProjectModeList key={mode} repo={repo} mode={mode} />
    </View>
  );
}

function ProjectModeList({ repo, mode }: { repo: Repo; mode: ArchiveListMode }) {
  const { openNew } = useProjectRepo();
  const scheme = useScheme();
  const projects = useQuery(PROJECT_LIST_QUERIES[mode], { repoId: repo._id });
  const statuses = useProjectListStatuses(repo._id, mode === "archived");
  const stageOf = (projectId: string): ProjectStage => statuses?.get(projectId)?.stage ?? "todo";
  const users = useQuery(api.users.listAll, {});
  const [filters, setFilters] = useState<StageListFilters>(STAGE_LIST_DEFAULTS);
  const [toggled, toggle] = toggledProjectPhases.useSet("all");
  const actions = useProjectActions({ repo, users });
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();

  if (projects === undefined) return <ProjectPlaceholders />;
  const changeFilters = (patch: Partial<StageListFilters>) => setFilters({ ...filters, ...patch });
  const shown = searchAndSortProjects(
    projects.filter((project) => !filters.hiddenPhases.includes(stageOf(project._id))),
    filters,
  );

  if (projects.length === 0 && mode === "archived") {
    return <EmptyState icon={IconLayoutKanban} title={archiveCopy("project").emptyArchived} />;
  }
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={IconLayoutKanban}
        title="No projects yet"
        description="Create a project to describe a feature and let AI help you break it down into tasks"
        action={
          <Button
            size="sm"
            fullWidth={false}
            leftIcon={<IconPlus size={16} color={EVA_THEME[scheme].primaryForeground} />}
            onPress={openNew}
          >
            Create Project
          </Button>
        }
      />
    );
  }

  const chips = projectFilterChips(filters, PROJECT_STAGES);
  return (
    <View className="flex-1">
      <ProjectsToolbar filters={filters} onChange={changeFilters} />
      <FilterChipsBar
        chips={chips}
        onClear={(key) => changeFilters(clearedProjectFilter(key))}
        onClearAll={() => changeFilters(clearedProjectFilters())}
      />
      {shown.length === 0 ? (
        <EmptyState
          icon={IconLayoutKanban}
          title="No matching projects"
          description="Try clearing filters to see all projects."
          action={
            <Button
              size="sm"
              fullWidth={false}
              leftIcon={<IconPlus size={16} color={EVA_THEME[scheme].primaryForeground} />}
              onPress={() => changeFilters(clearedProjectFilters())}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <SectionList
          {...LIST_WINDOW}
          sections={PROJECT_STAGES.filter((stage) => !filters.hiddenPhases.includes(stage)).map((stage) => {
            const rows = shown.filter((project) => stageOf(project._id) === stage);
            const open = (rows.length > 0) !== toggled.has(stage);
            return { stage, count: rows.length, open, data: open ? rows : [] };
          })}
          keyExtractor={(project) => project._id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const { icon, text } = projectStageAppearance(section.stage, scheme);
            return (
              <FoldHeader
                icon={icon}
                color={text}
                label={PROJECT_STAGE_LABELS[section.stage]}
                count={section.count}
                noun="project"
                open={section.open}
                onToggle={() => toggle(section.stage)}
              />
            );
          }}
          ItemSeparatorComponent={CardGap}
          renderItem={({ item: project }) => (
            <ProjectRow
              project={project}
              status={statuses?.get(project._id)}
              users={users}
              onLongPress={() => actions.openSheet(project)}
            />
          )}
          renderSectionFooter={({ section }) => <FoldFooter open={section.open} count={section.count} empty="No projects" />}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
      {actions.dialogs}
    </View>
  );
}

function ProjectPlaceholders() {
  const card = EVA_THEME[useScheme()].card;
  return (
    <SkeletonList
      label="Loading projects"
      divided={false}
      className="px-3"
      renderRow={(row) => (
        <View className="mb-2 rounded-lg" style={{ backgroundColor: card }}>
          <SkeletonRow index={row} lines={2} trailing={false} minHeight={112} className="px-3" />
        </View>
      )}
    />
  );
}

type Page = "root" | "sort" | "phases";

function ProjectsToolbar({
  filters,
  onChange,
}: {
  filters: StageListFilters;
  onChange: (patch: Partial<StageListFilters>) => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [page, setPage] = useState<Page | null>(null);
  const pick = (patch: Partial<StageListFilters>) => {
    onChange(patch);
    setPage(null);
  };
  const visibleCount = PROJECT_STAGES.length - filters.hiddenPhases.length;
  const phasesLabel = visibleCount === PROJECT_STAGES.length ? "All Phases" : `${visibleCount} Phases`;
  const sortLabel = `Sort: ${PROJECT_SORT_FIELD_LABELS[filters.sortField]} ${filters.sortDir === "asc" ? "↑" : "↓"}`;
  const hasActiveFilters = projectFilterChips(filters, PROJECT_STAGES).length > 0;
  const titles: Record<Page, string> = { root: "Options", sort: sortLabel, phases: phasesLabel };

  const body = (() => {
    switch (page) {
      case null:
      case "root":
        return (
          <>
            <SubmenuRow icon={IconSortDescending} title={sortLabel} onPress={() => setPage("sort")} />
            <MenuDivider />
            <SubmenuRow icon={IconFilter} title={phasesLabel} onPress={() => setPage("phases")} />
            {hasActiveFilters ? (
              <>
                <MenuDivider />
                <SheetRow icon={IconX} title="Clear all filters" onPress={() => pick(clearedProjectFilters())} />
              </>
            ) : null}
          </>
        );
      case "sort":
        return (
          <>
            {PROJECT_SORT_FIELDS.map((field) => (
              <SheetRow
                key={field}
                title={PROJECT_SORT_FIELD_LABELS[field]}
                active={filters.sortField === field}
                onPress={() => pick({ sortField: field })}
              />
            ))}
            <MenuDivider />
            <SheetRow title="Descending ↓" active={filters.sortDir === "desc"} onPress={() => pick({ sortDir: "desc" })} />
            <SheetRow title="Ascending ↑" active={filters.sortDir === "asc"} onPress={() => pick({ sortDir: "asc" })} />
          </>
        );
      case "phases":
        return PROJECT_STAGES.map((stage) => {
          const { icon: Icon, text } = projectStageAppearance(stage, scheme);
          return (
            <SheetRow
              key={stage}
              leading={<Icon size={20} color={text} />}
              title={PROJECT_STAGE_LABELS[stage]}
              active={!filters.hiddenPhases.includes(stage)}
              multiple
              onPress={() => onChange({ hiddenPhases: toggleHiddenProjectPhase(filters.hiddenPhases, stage, PROJECT_STAGES) })}
            />
          );
        });
    }
  })();

  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-2">
      <View className="min-w-0 flex-1">
        <SearchInput
          size="md"
          value={filters.q}
          onChange={(q) => onChange({ q })}
          label="Search projects"
          placeholder="Search projects..."
          returnKeyType="search"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View options"
        accessibilityState={{ expanded: page !== null }}
        onPress={() => setPage("root")}
        hitSlop={2}
        className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        style={{ backgroundColor: theme.secondary }}
      >
        <IconSettings size={16} color={theme.secondaryForeground} />
      </Pressable>
      <MenuSheet
        open={page !== null}
        onOpenChange={(open) => {
          if (!open) setPage(null);
        }}
        title={titles[page ?? "root"]}
        onBack={page !== null && page !== "root" ? () => setPage("root") : undefined}
      >
        {body}
      </MenuSheet>
    </View>
  );
}
