import { api } from "@eva/backend";
import { firstNameByUserId, repoDisplayLabel } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  PROJECT_TASK_DISPLAY_STATUS_LABELS,
  projectStatusCountsLine,
  projectStatusFromRows,
  projectTaskPullRequests,
  projectTaskStatusSections,
  projectTaskSummaryLine,
  unapprovedTodoTaskIds,
  type ProjectTaskView,
} from "@eva/shared/projectView";
import { IconLayoutList, IconPlus } from "@tabler/icons-react-native";
import { Button, EmptyState, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { ProjectProgress } from "@/projects/ProjectProgress";
import { ProjectTaskPrRow, ProjectTaskRow } from "@/projects/ProjectTaskRow";
import { useProjectTaskNotes, type ProjectTaskListRow } from "@/projects/useProjectStatus";
import { persistedIdSet } from "@/storage/persistedStore";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { FoldBandHeader, FoldFooter } from "@/ui/FoldHeader";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

/** A project's task status groups folded away from their default, kept on the device. */
const toggledProjectTaskStatuses = persistedIdSet("projectTaskDisplayStatusesToggled");

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
/** One list row: a task under its display status, or a task's PR. */
type Item = { kind: "task"; row: ProjectTaskListRow; view: ProjectTaskView } | { kind: "pr"; row: ProjectTaskListRow & { prUrl: string; repoName?: string } };

/** The Pull requests group's key, beside the display statuses (web `PULL_REQUESTS`). */
const PULL_REQUESTS = "pull_requests";

/**
 * The web project Tasks panel at phone width: a thin progress bar and the
 * counts as one muted line, then a collapsible group per display status
 * that has tasks, Triage, Working, Blocked, Idle, Archived
 * (`projectTaskStatusSections`; Archived starts folded, and holds the tasks
 * archived on their own, whose menu offers Unarchive), and the tasks'
 * Pull requests. Rows are flat (`ProjectTaskRow`, `ProjectTaskPrRow`).
 * Triage carries "Approve all" (every todo task nobody approved yet). The
 * first group carries "+" (a new task, to Triage unless "Start now"), or the
 * empty state does when there are no tasks. An archived project's list is
 * read-only: no "+", no "Approve all", no Reject / Approve, no row menu.
 */
export function ProjectTasks({
  project,
  repo,
  users,
  tasks,
  failedTaskIds,
}: {
  project: Project;
  repo: Repo;
  users: User[] | undefined;
  /** `agentTasks.listByProject`, undefined while it loads (`useProjectTaskStatus`). */
  tasks: ProjectTaskListRow[] | undefined;
  failedTaskIds: ReadonlySet<string>;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const repos = useQuery(api.githubRepos.list, {});
  const notesByTask = useProjectTaskNotes(project._id);
  const archivedTasks = useQuery(api.agentTasks.listByProject, { projectId: project._id, archived: true });
  const actions = useQuickTaskActions({ repo, users, projects });
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [approving, setApproving] = useState(false);
  // Sections the user folded or unfolded, against each one's `defaultOpen`.
  const [toggled, toggle] = toggledProjectTaskStatuses.useSet("all");
  const sections = tasks === undefined ? [] : projectTaskStatusSections(tasks, failedTaskIds, archivedTasks ?? []);
  // One lookup for the people who added the Triage tasks ("Added by <name>").
  const authorIds = [
    ...new Set(
      (sections.find((section) => section.status === "triage")?.tasks ?? []).flatMap(({ row }) =>
        row.createdBy !== undefined ? [row.createdBy] : [],
      ),
    ),
  ];
  const authors = useQuery(api.users.getMany, authorIds.length > 0 ? { ids: authorIds } : "skip");
  const authorNames = firstNameByUserId(authors ?? []);

  if (tasks === undefined) {
    return (
      <SkeletonList
        label="Loading tasks"
        divided={false}
        className="px-3"
        renderRow={(row) => <SkeletonRow index={row} lines={2} trailing={false} minHeight={44} className="px-2" />}
      />
    );
  }
  const live = project.archivedAt === undefined;
  const openNewTask = () =>
    router.push({ pathname: "/quick-task/new", params: { repoId: repo._id, projectId: project._id } });
  const reposById = new Map((repos ?? []).map((entry) => [String(entry._id), entry]));
  const toApprove = unapprovedTodoTaskIds(tasks);
  const numIdById = new Map([...tasks, ...(archivedTasks ?? [])].map((task) => [String(task._id), task.numId]));
  const pullRequests = projectTaskPullRequests(tasks);
  const status = projectStatusFromRows(tasks, failedTaskIds);
  const groups = [
    ...sections.map((section) => ({
      key: section.status,
      label: PROJECT_TASK_DISPLAY_STATUS_LABELS[section.status],
      noun: "task",
      defaultOpen: section.defaultOpen,
      items: section.tasks.map(({ row, view }): Item => ({ kind: "task", row, view })),
    })),
    ...(pullRequests.length > 0
      ? [{ key: PULL_REQUESTS, label: "Pull requests", noun: "PR", defaultOpen: true, items: pullRequests.map((row): Item => ({ kind: "pr", row })) }]
      : []),
  ];
  const lineFor = (row: ProjectTaskListRow, view: ProjectTaskView) => {
    const otherRepo = row.repoId !== undefined && row.repoId !== project.repoId ? reposById.get(String(row.repoId)) : undefined;
    return projectTaskSummaryLine(row, view, {
      notes: notesByTask.get(row._id),
      failed: failedTaskIds.has(row._id),
      authorName: row.createdBy !== undefined ? authorNames.get(row.createdBy) : undefined,
      otherRepoLabel: otherRepo ? repoDisplayLabel(otherRepo) : undefined,
      numIdOf: (taskId) => numIdById.get(taskId),
    });
  };

  const approveAll = () => {
    setApproving(true);
    approveTasks({ projectId: project._id, taskIds: toApprove })
      .then(
        () => toast.success(toApprove.length === 1 ? "Task approved" : "Tasks approved"),
        () => toast.error("Couldn't approve the tasks"),
      )
      .then(() => setApproving(false));
  };

  return (
    <>
      <SectionList
        {...LIST_WINDOW}
        sections={groups.map((group, index) => {
          const open = group.defaultOpen !== toggled.has(group.key);
          return { ...group, first: index === 0, count: group.items.length, open, data: open ? group.items : [] };
        })}
        keyExtractor={(item) => (item.kind === "pr" ? `pr:${item.row._id}:${item.row.prUrl}` : `task:${item.row._id}`)}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          sections.length > 0 ? (
            <View className="gap-2 px-1 pb-3 pt-1">
              <ProjectProgress status={status} thin />
              <Text
                className="font-instrument-sans"
                style={{ fontSize: 12, lineHeight: 16, letterSpacing: XS_TRACKING, color: muted, fontVariant: ["tabular-nums"] }}
              >
                {projectStatusCountsLine(status.counts)}
              </Text>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => {
          return (
            <FoldBandHeader
              label={section.label}
              count={section.count}
              noun={section.noun}
              open={section.open}
              onToggle={() => toggle(section.key)}
              trailing={
                live && (section.first || section.key === "triage") ? (
                  <View className="mr-1 flex-row items-center gap-1">
                    {section.key === "triage" && toApprove.length > 0 ? (
                      <Button size="sm" variant="ghost" fullWidth={false} loading={approving} disabled={approving} onPress={approveAll}>
                        Approve all
                      </Button>
                    ) : null}
                    {/* The web outline "+": a 44 square here, in place of the web 24. */}
                    {section.first ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="New task"
                        onPress={openNewTask}
                        className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
                      >
                        <IconPlus size={14} color={muted} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : undefined
              }
            />
          );
        }}
        renderItem={({ item }) =>
          item.kind === "pr" ? (
            <ProjectTaskPrRow task={item.row} />
          ) : (
            <ProjectTaskRow
              task={item.row}
              view={item.view}
              line={lineFor(item.row, item.view)}
              projectId={project._id}
              readOnly={!live}
              onLongPress={live ? () => actions.openSheet(item.row) : undefined}
            />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon={IconLayoutList}
            title="No tasks"
            action={
              live ? (
                <Button
                  size="sm"
                  fullWidth={false}
                  leftIcon={<IconPlus size={16} color={EVA_THEME[scheme].primaryForeground} />}
                  onPress={openNewTask}
                >
                  New task
                </Button>
              ) : undefined
            }
          />
        }
        renderSectionFooter={({ section }) => <FoldFooter open={section.open} count={section.count} empty="No tasks" />}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
      />
      {actions.dialogs}
    </>
  );
}
