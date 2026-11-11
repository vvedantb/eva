import type { api } from "@eva/backend";
import {
  QUICK_TASK_SORT_FIELDS,
  QUICK_TASK_SORT_FIELD_LABELS,
  QUICK_TASK_TIME_RANGES,
  QUICK_TASK_TIME_RANGE_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  clearedQuickTaskFilter,
  clearedQuickTaskFilters,
  hasActiveQuickTaskFilters,
  quickTaskFilterChips,
  toggleQuickTaskStatus,
  type QuickTaskListFilters,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconClock,
  IconFilter,
  IconFolder,
  IconSettings,
  IconSortDescending,
  IconTag,
  IconUser,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react-native";
import { SheetRow } from "@vvedantb/native-ui/primitives";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { FilterChipsBar } from "@/ui/FilterChipsBar";
import { MenuDivider, MenuSheet, SubmenuRow } from "@/ui/MenuSheet";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { useScheme } from "@/ui/theme";

type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];

/** The web menus' name for a teammate: the full name, else the first name. */
export function userLabel(user: User | undefined): string | undefined {
  return user?.fullName ?? user?.firstName;
}

type Page = "root" | "sort" | "project" | "user" | "assignee" | "statuses" | "tags" | "timeRange";

/**
 * The web Quick Tasks toolbar at phone width: the search field ("Search
 * tasks...") and the Options menu, as a bottom sheet with a page per web
 * submenu: Sort, Project, Created by, Code reviewer, Statuses, Tags (when
 * there are any) and the time range, then "Clear all filters" when a filter
 * is on. A radio pick closes the sheet, as the web menu closes; a status or
 * tag toggle keeps it open. "Import from Linear" stays on the web.
 */
export function QuickTaskToolbar({
  filters,
  onChange,
  projects,
  users,
  allTags,
}: {
  filters: QuickTaskListFilters;
  onChange: (patch: Partial<QuickTaskListFilters>) => void;
  projects: Project[] | undefined;
  users: User[] | undefined;
  allTags: string[];
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [page, setPage] = useState<Page | null>(null);
  const pick = (patch: Partial<QuickTaskListFilters>) => {
    onChange(patch);
    setPage(null);
  };
  const userName = (id: string) => userLabel(users?.find((user) => user._id === id));
  const reviewers = (users ?? []).filter((user) => user.role === "dev");

  const projectLabel =
    filters.project === "all"
      ? "All Tasks"
      : filters.project === "none"
        ? "No Project"
        : (projects?.find((project) => project._id === filters.project)?.title ?? "Project");
  const userFilterLabel = filters.user === "all" ? "All Users" : (userName(filters.user) ?? "User");
  const assigneeLabel =
    filters.assignee === "all"
      ? "All Code Reviewers"
      : filters.assignee === "unassigned"
        ? "Unassigned"
        : (userName(filters.assignee) ?? "Code Reviewer");
  const statusesLabel =
    filters.statuses.length === TASK_STATUSES.length ? "All Statuses" : `${filters.statuses.length} Statuses`;
  const tagsLabel =
    filters.tags.length === 0 ? "All Tags" : `${filters.tags.length} Tag${filters.tags.length > 1 ? "s" : ""}`;
  const sortLabel = `Sort: ${QUICK_TASK_SORT_FIELD_LABELS[filters.sortField]} ${filters.sortDir === "asc" ? "↑" : "↓"}`;

  const titles: Record<Page, string> = {
    root: "Options",
    sort: sortLabel,
    project: projectLabel,
    user: userFilterLabel,
    assignee: assigneeLabel,
    statuses: statusesLabel,
    tags: tagsLabel,
    timeRange: QUICK_TASK_TIME_RANGE_LABELS[filters.timeRange],
  };

  const body = (() => {
    switch (page) {
      case null:
      case "root":
        return (
          <>
            <SubmenuRow icon={IconSortDescending} title={sortLabel} onPress={() => setPage("sort")} />
            <MenuDivider />
            <SubmenuRow icon={IconFolder} title={projectLabel} onPress={() => setPage("project")} />
            <SubmenuRow icon={IconUser} title={userFilterLabel} onPress={() => setPage("user")} />
            <SubmenuRow icon={IconUserCheck} title={assigneeLabel} onPress={() => setPage("assignee")} />
            <SubmenuRow icon={IconFilter} title={statusesLabel} onPress={() => setPage("statuses")} />
            {allTags.length > 0 ? <SubmenuRow icon={IconTag} title={tagsLabel} onPress={() => setPage("tags")} /> : null}
            <SubmenuRow
              icon={IconClock}
              title={QUICK_TASK_TIME_RANGE_LABELS[filters.timeRange]}
              onPress={() => setPage("timeRange")}
            />
            {hasActiveQuickTaskFilters(filters) ? (
              <>
                <MenuDivider />
                <SheetRow icon={IconX} title="Clear all filters" onPress={() => pick(clearedQuickTaskFilters())} />
              </>
            ) : null}
          </>
        );
      case "sort":
        return (
          <>
            {QUICK_TASK_SORT_FIELDS.map((field) => (
              <SheetRow
                key={field}
                title={QUICK_TASK_SORT_FIELD_LABELS[field]}
                active={filters.sortField === field}
                onPress={() => pick({ sortField: field })}
              />
            ))}
            <MenuDivider />
            <SheetRow title="Descending ↓" active={filters.sortDir === "desc"} onPress={() => pick({ sortDir: "desc" })} />
            <SheetRow title="Ascending ↑" active={filters.sortDir === "asc"} onPress={() => pick({ sortDir: "asc" })} />
          </>
        );
      case "project":
        return (
          <>
            <SheetRow title="All Tasks" active={filters.project === "all"} onPress={() => pick({ project: "all" })} />
            <SheetRow title="No Project" active={filters.project === "none"} onPress={() => pick({ project: "none" })} />
            {projects && projects.length > 0 ? <MenuDivider /> : null}
            {(projects ?? []).map((project) => (
              <SheetRow
                key={project._id}
                title={project.title}
                active={filters.project === project._id}
                onPress={() => pick({ project: project._id })}
              />
            ))}
          </>
        );
      case "user":
        return (
          <>
            <SheetRow title="All Users" active={filters.user === "all"} onPress={() => pick({ user: "all" })} />
            {users && users.length > 0 ? <MenuDivider /> : null}
            {(users ?? []).map((user) => (
              <SheetRow
                key={user._id}
                title={userLabel(user) ?? "Unknown"}
                active={filters.user === user._id}
                onPress={() => pick({ user: user._id })}
              />
            ))}
          </>
        );
      case "assignee":
        return (
          <>
            <SheetRow
              title="All Code Reviewers"
              active={filters.assignee === "all"}
              onPress={() => pick({ assignee: "all" })}
            />
            <SheetRow
              title="Unassigned"
              active={filters.assignee === "unassigned"}
              onPress={() => pick({ assignee: "unassigned" })}
            />
            {reviewers.length > 0 ? <MenuDivider /> : null}
            {reviewers.map((user) => (
              <SheetRow
                key={user._id}
                title={userLabel(user) ?? "Unknown"}
                active={filters.assignee === user._id}
                onPress={() => pick({ assignee: user._id })}
              />
            ))}
          </>
        );
      case "statuses":
        return TASK_STATUSES.map((status) => {
          const { icon: Icon, text } = statusAppearance(status, scheme);
          return (
            <SheetRow
              key={status}
              leading={<Icon size={20} color={text} />}
              title={TASK_STATUS_LABELS[status]}
              active={filters.statuses.includes(status)}
              onPress={() => onChange({ statuses: toggleQuickTaskStatus(filters.statuses, status) })}
            />
          );
        });
      case "tags":
        return allTags.map((tag) => (
          <SheetRow
            key={tag}
            title={tag}
            active={filters.tags.includes(tag)}
            onPress={() =>
              onChange({ tags: filters.tags.includes(tag) ? filters.tags.filter((entry) => entry !== tag) : [...filters.tags, tag] })
            }
          />
        ));
      case "timeRange":
        return QUICK_TASK_TIME_RANGES.map((range) => (
          <SheetRow
            key={range}
            title={QUICK_TASK_TIME_RANGE_LABELS[range]}
            active={filters.timeRange === range}
            onPress={() => pick({ timeRange: range })}
          />
        ));
    }
  })();

  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-2">
      <View className="min-w-0 flex-1">
        <SearchInput
          size="md"
          value={filters.q}
          onChange={(q) => onChange({ q })}
          label="Search tasks"
          placeholder="Search tasks..."
          returnKeyType="search"
        />
      </View>
      {/* The web `secondary` Options button, icon only below `sm`: a pill (a circle here), 40 high, reaching 44 with its slop. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Options"
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

/** The web `ActiveFiltersBar` for the quick-task filters (`FilterChipsBar`). */
export function ActiveFiltersBar({
  filters,
  onChange,
  projects,
  users,
}: {
  filters: QuickTaskListFilters;
  onChange: (patch: Partial<QuickTaskListFilters>) => void;
  projects: Project[] | undefined;
  users: User[] | undefined;
}) {
  const chips = quickTaskFilterChips(filters, {
    project: (id) => projects?.find((project) => project._id === id)?.title,
    user: (id) => userLabel(users?.find((user) => user._id === id)),
  });
  return (
    <FilterChipsBar
      chips={chips.map((chip) => ({ key: chip.key, label: `${chip.text}${chip.person ?? ""}` }))}
      onClear={(key) => {
        const chip = chips.find((candidate) => candidate.key === key);
        if (chip) onChange(clearedQuickTaskFilter(chip.key));
      }}
      onClearAll={() => onChange(clearedQuickTaskFilters())}
    />
  );
}
