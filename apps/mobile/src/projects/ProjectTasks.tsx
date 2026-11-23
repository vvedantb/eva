import { api } from "@eva/backend";
import { firstNameByUserId } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { PROJECT_TASK_DISPLAY_STATUS_LABELS, projectTaskStatusSections, unapprovedTodoTaskIds } from "@eva/shared/projectView";
import { IconCheck, IconLayoutList, IconPlus } from "@tabler/icons-react-native";
import { Button, EmptyState, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { taskDisplayStatusAppearance } from "@/projects/phaseAppearance";
import { ProjectTaskRow } from "@/projects/ProjectTaskRow";
import { useProjectTaskNotes, type ProjectTaskListRow } from "@/projects/useProjectStatus";
import { persistedIdSet } from "@/storage/persistedStore";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { FoldFooter, FoldHeader } from "@/ui/FoldHeader";
import { useScheme } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

/** A project's task status groups folded away from their default, kept on the device. */
const toggledProjectTaskStatuses = persistedIdSet("projectTaskDisplayStatusesToggled");

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The web project task list (`ProjectTaskListPanel`) at phone width: a
 * collapsible section per display status that has tasks, Triage, Working,
 * Blocked, Idle, Archived (`projectTaskStatusSections`: Idle in project
 * order, the rest latest run first; Archived starts folded), with the
 * compact project task rows (`ProjectTaskRow`; a locked row for a task in a
 * repo the reader cannot open). Triage carries "Approve all" (every todo
 * task nobody approved yet). For a contributor, the first section carries
 * "+" (a new task), or the empty state does when there are no tasks; a
 * viewer files feedback from the screen's dock. A tap opens the task.
 */
export function ProjectTasks({
  project,
  repo,
  users,
  tasks,
  failedTaskIds,
  canContribute,
}: {
  project: Project;
  repo: Repo;
  users: User[] | undefined;
  /** `agentTasks.listByProject`, undefined while it loads (`useProjectTaskStatus`). */
  tasks: ProjectTaskListRow[] | undefined;
  failedTaskIds: ReadonlySet<string>;
  /** The reader may approve, cancel and run (`callerRole`). */
  canContribute: boolean;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const draftMarks = useQuery(api.drafts.listMarks, { repoId: repo._id });
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const repos = useQuery(api.githubRepos.list, {});
  const notesByTask = useProjectTaskNotes(project._id);
  const actions = useQuickTaskActions({ repo, users, projects });
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [approving, setApproving] = useState(false);
  // Sections the user folded or unfolded, against each one's `defaultOpen`.
  const [toggled, toggle] = toggledProjectTaskStatuses.useSet("all");
  const sections = tasks === undefined ? [] : projectTaskStatusSections(tasks, failedTaskIds);
  // One lookup for the people who wrote the Triage feedback tasks.
  const authorIds = [
    ...new Set(
      (sections.find((section) => section.status === "triage")?.tasks ?? []).flatMap(({ row }) =>
        row.origin === "feedback" && row.createdBy !== undefined ? [row.createdBy] : [],
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
        renderRow={(row) => (
          <View className="mb-1 rounded-lg" style={{ backgroundColor: EVA_THEME[scheme].card }}>
            <SkeletonRow index={row} lines={1} trailing={false} minHeight={44} className="px-3" />
          </View>
        )}
      />
    );
  }
  const openNewTask = () =>
    router.push({ pathname: "/quick-task/new", params: { repoId: repo._id, projectId: project._id } });
  const draftTaskIds = new Set<string>(draftMarks?.taskIds ?? []);
  const reposById = new Map((repos ?? []).map((entry) => [String(entry._id), entry]));
  const toApprove = canContribute ? unapprovedTodoTaskIds(tasks) : [];

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
        sections={sections.map((section, index) => {
          const open = section.defaultOpen !== toggled.has(section.status);
          return { status: section.status, first: index === 0, count: section.tasks.length, open, data: open ? section.tasks : [] };
        })}
        keyExtractor={(task) => task.row._id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => {
          const { icon, text } = taskDisplayStatusAppearance(section.status, scheme);
          return (
            <FoldHeader
              icon={icon}
              color={text}
              label={PROJECT_TASK_DISPLAY_STATUS_LABELS[section.status]}
              count={section.count}
              noun="task"
              open={section.open}
              onToggle={() => toggle(section.status)}
              trailing={
                canContribute && (section.first || section.status === "triage") ? (
                  <View className="mr-1 flex-row items-center gap-1">
                    {section.status === "triage" && toApprove.length > 0 ? (
                      <Button
                        size="sm"
                        fullWidth={false}
                        loading={approving}
                        disabled={approving}
                        leftIcon={<IconCheck size={14} color={EVA_THEME[scheme].primaryForeground} />}
                        onPress={approveAll}
                      >
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
        ItemSeparatorComponent={TaskGap}
        renderItem={({ item: { row, view } }) => (
          <ProjectTaskRow
            task={row}
            view={view}
            authorName={row.createdBy !== undefined ? authorNames.get(row.createdBy) : undefined}
            notes={notesByTask.get(row._id)}
            hasError={failedTaskIds.has(row._id)}
            hasDraftComment={draftTaskIds.has(row._id)}
            projectId={project._id}
            projectNumId={project.numId}
            homeRepoId={project.repoId}
            reposById={reposById}
            canContribute={canContribute}
            onLongPress={() => actions.openSheet(row)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={IconLayoutList}
            title="No tasks"
            action={
              canContribute ? (
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

/** The gap between compact task rows: half the quick-task card gap (`CardGap`). */
function TaskGap() {
  return <View className="h-1" />;
}
