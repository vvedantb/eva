import { m, AnimatePresence } from "motion/react";
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
  tokenTransition,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ToggleSearch,
} from "@vvedantb/ui";
import {
  IconPlus,
  IconCheckbox,
  IconLayoutKanban,
  IconList,
  IconFileImport,
  IconFolder,
  IconSettings,
  IconFilter,
  IconUser,
  IconTag,
  IconUserCheck,
  IconSortDescending,
  IconClock,
  IconX,
} from "@tabler/icons-react";
import {
  statusConfig,
  TASK_STATUSES,
  type DisplayTaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { useQuickTaskFilters } from "../_utils";
import {
  QUICK_TASK_SORT_FIELDS,
  QUICK_TASK_SORT_FIELD_LABELS,
  QUICK_TASK_TIME_RANGES,
  QUICK_TASK_TIME_RANGE_LABELS,
  clearedQuickTaskFilters,
  hasActiveQuickTaskFilters,
  toggleQuickTaskStatus,
  type QuickTaskSortDir,
  type QuickTaskSortField,
  type QuickTaskTimeRange,
} from "@eva/shared";

type QuickTaskView = "kanban" | "list";
type Project = FunctionReturnType<typeof api.projects.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

function isQuickTaskView(value: string): value is QuickTaskView {
  return value === "kanban" || value === "list";
}

const isSortField = (v: string): v is QuickTaskSortField =>
  QUICK_TASK_SORT_FIELDS.some((field) => field === v);

const SORT_DIRS = ["asc", "desc"] as const;
const isSortDir = (v: string): v is QuickTaskSortDir =>
  SORT_DIRS.some((dir) => dir === v);

const isTimeRange = (v: string): v is QuickTaskTimeRange =>
  QUICK_TASK_TIME_RANGES.some((range) => range === v);

interface QuickTasksToolbarProps {
  view: QuickTaskView;
  onViewChange: (v: QuickTaskView) => void;
  searchQuery: string;
  onSearchChange: (v: string | null) => void;
  hasQuickTasks: boolean;
  isSelecting: boolean;
  onStartSelecting: () => void;
  onCreateTask: () => void;
  onImport: () => void;
  projects: Project[] | undefined;
  projectFilter: string;
  onProjectFilterChange: (v: string) => void;
  users: User[] | undefined;
  userFilter: string;
  onUserFilterChange: (v: string) => void;
  allTags: string[];
}

export function QuickTasksToolbar({
  view,
  onViewChange,
  searchQuery,
  onSearchChange,
  hasQuickTasks,
  isSelecting,
  onStartSelecting,
  onCreateTask,
  onImport,
  projects,
  projectFilter,
  onProjectFilterChange,
  users,
  userFilter,
  onUserFilterChange,
  allTags,
}: QuickTasksToolbarProps) {
  const filterLabel =
    projectFilter === "all"
      ? "All Tasks"
      : projectFilter === "none"
        ? "No Project"
        : (projects?.find((p) => p._id === projectFilter)?.title ?? "Project");

  const userFilterLabel =
    userFilter === "all" ? (
      "All Users"
    ) : (
      <span data-pii>
        {users?.find((u) => u._id === userFilter)?.fullName ??
          users?.find((u) => u._id === userFilter)?.firstName ??
          "User"}
      </span>
    );

  const [filters, setParams] = useQuickTaskFilters();
  const { statuses, assignee, tags, sortField, sortDir, timeRange } = filters;
  const visibleStatuses = new Set(statuses);
  const selectedTags = new Set(tags);

  const reviewers = (users ?? []).filter((u) => u.role === "dev");

  const assigneeLabel =
    assignee === "all" ? (
      "All Code Reviewers"
    ) : assignee === "unassigned" ? (
      "Unassigned"
    ) : (
      <span data-pii>
        {users?.find((u) => u._id === assignee)?.fullName ??
          users?.find((u) => u._id === assignee)?.firstName ??
          "Code Reviewer"}
      </span>
    );

  const handleStatusToggle = (status: DisplayTaskStatus) => {
    setParams({ statuses: toggleQuickTaskStatus(statuses, status) });
  };

  const handleTagToggle = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    setParams({ tags: [...next] });
  };

  const hasActiveFilters = hasActiveQuickTaskFilters(filters);

  const clearAllFilters = () => {
    setParams(clearedQuickTaskFilters());
  };

  return (
    <div className="flex max-sm:min-w-0 max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
      <ToggleSearch
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Search tasks..."
        visible={hasQuickTasks}
        variant="large"
      />
      {hasQuickTasks && (
        <Tabs
          value={view}
          onValueChange={(value) => {
            if (isQuickTaskView(value)) onViewChange(value);
          }}
        >
          <TabsList className="tabs-segmented h-8">
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="kanban"
                  aria-label="Kanban view"
                  className="px-2.5 py-1"
                >
                  <IconLayoutKanban size={16} />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>Kanban view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="list"
                  aria-label="List view"
                  className="px-2.5 py-1"
                >
                  <IconList size={16} />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
          </TabsList>
        </Tabs>
      )}
      <AnimatePresence initial={false} mode="popLayout">
        {hasQuickTasks && !isSelecting ? (
          <m.div
            key="quick-task-select-action"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={tokenTransition.fast}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="motion-press hover:scale-[1.01] active:scale-[0.96]"
                  onClick={onStartSelecting}
                >
                  <IconCheckbox size={16} />
                  {/* `sr-only`, not `hidden`: the tooltip below is hover-only,
                      so on touch this span is the button's only name. */}
                  <span className="max-sm:sr-only">Select</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">Select</TooltipContent>
            </Tooltip>
          </m.div>
        ) : null}
      </AnimatePresence>
      {hasQuickTasks && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              className="motion-press hover:scale-[1.01] active:scale-[0.96]"
            >
              <IconSettings size={16} />
              <span className="max-sm:sr-only">Options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onImport}>
              <IconFileImport size={16} className="mr-2" />
              Import from Linear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IconSortDescending size={16} className="mr-2" />
                Sort: {QUICK_TASK_SORT_FIELD_LABELS[sortField]}{" "}
                {sortDir === "asc" ? "↑" : "↓"}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={sortField}
                  onValueChange={(v) => {
                    if (isSortField(v)) setParams({ sortField: v });
                  }}
                >
                  {QUICK_TASK_SORT_FIELDS.map((f) => (
                    <DropdownMenuRadioItem key={f} value={f}>
                      {QUICK_TASK_SORT_FIELD_LABELS[f]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={sortDir}
                  onValueChange={(v) => {
                    if (isSortDir(v)) setParams({ sortDir: v });
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
                <IconFolder size={16} className="mr-2" />
                {filterLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={projectFilter}
                  onValueChange={onProjectFilterChange}
                >
                  <DropdownMenuRadioItem value="all">
                    All Tasks
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="none">
                    No Project
                  </DropdownMenuRadioItem>
                  {projects && projects.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {projects.map((p) => (
                        <DropdownMenuRadioItem key={p._id} value={p._id}>
                          {p.title}
                        </DropdownMenuRadioItem>
                      ))}
                    </>
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IconUser size={16} className="mr-2" />
                {userFilterLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={userFilter}
                  onValueChange={onUserFilterChange}
                >
                  <DropdownMenuRadioItem value="all">
                    All Users
                  </DropdownMenuRadioItem>
                  {users && users.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {users.map((u) => (
                        <DropdownMenuRadioItem key={u._id} value={u._id}>
                          <span data-pii>
                            {u.fullName ?? u.firstName ?? "Unknown"}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </>
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IconUserCheck size={16} className="mr-2" />
                {assigneeLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={assignee}
                  onValueChange={(v) => setParams({ assignee: v })}
                >
                  <DropdownMenuRadioItem value="all">
                    All Code Reviewers
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="unassigned">
                    Unassigned
                  </DropdownMenuRadioItem>
                  {reviewers.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {reviewers.map((u) => (
                        <DropdownMenuRadioItem key={u._id} value={u._id}>
                          <span data-pii>
                            {u.fullName ?? u.firstName ?? "Unknown"}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </>
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IconFilter size={16} className="mr-2" />
                {visibleStatuses.size === TASK_STATUSES.length
                  ? "All Statuses"
                  : `${visibleStatuses.size} Statuses`}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {TASK_STATUSES.map((s) => {
                  const cfg = statusConfig[s];
                  return (
                    <DropdownMenuCheckboxItem
                      key={s}
                      checked={visibleStatuses.has(s)}
                      onCheckedChange={() => handleStatusToggle(s)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <cfg.icon size={16} className={cfg.text + " mr-2"} />
                      <span className={cfg.text}>{cfg.label}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {allTags.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <IconTag size={16} className="mr-2" />
                  {selectedTags.size === 0
                    ? "All Tags"
                    : `${selectedTags.size} Tag${selectedTags.size > 1 ? "s" : ""}`}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {allTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={selectedTags.has(tag)}
                      onCheckedChange={() => handleTagToggle(tag)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <IconClock size={16} className="mr-2" />
                {QUICK_TASK_TIME_RANGE_LABELS[timeRange]}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={timeRange}
                  onValueChange={(v) => {
                    if (isTimeRange(v)) setParams({ timeRange: v });
                  }}
                >
                  {QUICK_TASK_TIME_RANGES.map((r) => (
                    <DropdownMenuRadioItem key={r} value={r}>
                      {QUICK_TASK_TIME_RANGE_LABELS[r]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
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
        className="motion-press hover:scale-[1.01] active:scale-[0.96]"
        onClick={onCreateTask}
      >
        <IconPlus size={16} />
        <span className="max-sm:sr-only">New Task</span>
      </Button>
    </div>
  );
}
