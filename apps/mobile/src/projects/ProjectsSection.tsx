import { api } from "@eva/backend";
import {
  PROJECT_COLUMNS,
  PROJECT_COLUMN_LABELS,
  PROJECT_LIST_DEFAULTS,
  PROJECT_SORT_FIELDS,
  PROJECT_SORT_FIELD_LABELS,
  clearedProjectFilter,
  clearedProjectFilters,
  filterAndSortProjects,
  projectColumn,
  projectFilterChips,
  toggleHiddenProjectPhase,
  type ProjectListFilters,
} from "@eva/shared";
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
import { columnAppearance } from "@/projects/phaseAppearance";
import { ProjectRow } from "@/projects/ProjectRow";
import { useProjectActions } from "@/projects/useProjectActions";
import { CardGap, FoldFooter, FoldHeader } from "@/ui/FoldHeader";
import { FilterChipsBar } from "@/ui/FilterChipsBar";
import { persistedIdSet } from "@/storage/persistedStore";
import { RepoPicker, useRepoParam } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

/** The column groups (To Do, In Progress…) folded away from their default (open with projects), kept on the device. */
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
    /** The new-project screen, on this repo. */
    openNew: () => router.push(repo ? { pathname: "/project/new", params: { repoId: repo._id } } : "/project/new"),
  };
}

/**
 * The web Projects list view at phone width, for one repo: the repo picker,
 * the toolbar (search and the Options sheet: sort and phases, the web
 * `ProjectsClient` toolbar) and its "Filtered by" chips, then a collapsible
 * section per shown column (icon, label, count) in workflow order: Draft
 * and Finalised share To Do, told apart by the card badge, each with
 * its project cards or "No projects". Sections with projects start open, as
 * the web. A long press on a card opens the web project menu as a sheet
 * (`useProjectActions`). A `SectionList`, as a repo's projects have no cap.
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
      {/* Keyed on the repo: its search, filters and open sections start fresh. */}
      <ProjectList key={repo._id} repo={repo} />
    </View>
  );
}

function ProjectList({ repo }: { repo: Repo }) {
  const { openNew } = useProjectRepo();
  const scheme = useScheme();
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const progress = useQuery(api.projects.listTaskProgress, { repoId: repo._id });
  const users = useQuery(api.users.listAll, {});
  const [filters, setFilters] = useState<ProjectListFilters>(PROJECT_LIST_DEFAULTS);
  // Columns the user folded or unfolded: as the web, a column starts open when it has projects.
  const [toggled, toggle] = toggledProjectPhases.useSet("all");
  const actions = useProjectActions({ repo, users });
  const largerText = useLargerText();
  const insets = useSafeAreaInsets();

  if (projects === undefined) return <ProjectPlaceholders />;
  const changeFilters = (patch: Partial<ProjectListFilters>) => setFilters({ ...filters, ...patch });
  const shown = filterAndSortProjects(projects, filters);

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

  const chips = projectFilterChips(filters, PROJECT_COLUMNS);
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
          sections={PROJECT_COLUMNS.filter((column) => !filters.hiddenPhases.includes(column)).map((column) => {
            const rows = shown.filter((project) => projectColumn(project.phase) === column);
            const open = (rows.length > 0) !== toggled.has(column);
            return { column, count: rows.length, open, data: open ? rows : [] };
          })}
          keyExtractor={(project) => project._id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const { icon, text } = columnAppearance(section.column, scheme);
            return (
              <FoldHeader
                icon={icon}
                color={text}
                label={PROJECT_COLUMN_LABELS[section.column]}
                count={section.count}
                noun="project"
                open={section.open}
                onToggle={() => toggle(section.column)}
              />
            );
          }}
          ItemSeparatorComponent={CardGap}
          renderItem={({ item: project }) => (
            <ProjectRow
              project={project}
              progress={progress?.find((entry) => entry.projectId === project._id)}
              users={users}
              onLongPress={() => actions.openSheet(project)}
            />
          )}
          renderSectionFooter={({ section }) => <FoldFooter open={section.open} count={section.count} empty="No projects" />}
          // Web: the list `p-3 pt-0`.
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabBarReserve(largerText, insets.bottom) }}
        />
      )}
      {actions.dialogs}
    </View>
  );
}

/** While the projects load: cards shaped as `ProjectRow` (title over preview, then the bar), 8 apart, on the list's `px-3`. */
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

/**
 * The web Projects toolbar at phone width: the search field ("Search
 * projects...") and the Options menu as a bottom sheet with a page per web
 * submenu: Sort (field, then direction) and Phases, then "Clear all filters"
 * when a filter is on. A sort pick closes the sheet, as the web menu
 * closes; a phase toggle keeps it open, and the last shown phase stays.
 * "+ New Project" is the header's "+".
 */
function ProjectsToolbar({
  filters,
  onChange,
}: {
  filters: ProjectListFilters;
  onChange: (patch: Partial<ProjectListFilters>) => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [page, setPage] = useState<Page | null>(null);
  const pick = (patch: Partial<ProjectListFilters>) => {
    onChange(patch);
    setPage(null);
  };
  const visibleCount = PROJECT_COLUMNS.length - filters.hiddenPhases.length;
  const phasesLabel = visibleCount === PROJECT_COLUMNS.length ? "All Phases" : `${visibleCount} Phases`;
  const sortLabel = `Sort: ${PROJECT_SORT_FIELD_LABELS[filters.sortField]} ${filters.sortDir === "asc" ? "↑" : "↓"}`;
  const hasActiveFilters = projectFilterChips(filters, PROJECT_COLUMNS).length > 0;
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
        return PROJECT_COLUMNS.map((column) => {
          const { icon: Icon, text } = columnAppearance(column, scheme);
          return (
            <SheetRow
              key={column}
              leading={<Icon size={20} color={text} />}
              title={PROJECT_COLUMN_LABELS[column]}
              active={!filters.hiddenPhases.includes(column)}
              multiple
              onPress={() => onChange({ hiddenPhases: toggleHiddenProjectPhase(filters.hiddenPhases, column, PROJECT_COLUMNS) })}
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
      {/* The web `secondary` Options button, icon only below `sm`: 40 high, reaching 44 with its slop. */}
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
