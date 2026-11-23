import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { PROJECT_TASK_DISPLAY_STATUS_LABELS, projectTaskStatusSections, unapprovedTodoTaskIds } from "@eva/shared/projectView";
import { IconCheck, IconPlus } from "@tabler/icons-react-native";
import { Button, SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
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
 * The web project Tasks tab (`ProjectTaskListPanel`) at phone width: a
 * collapsible section per display status, Working, Blocked, Idle, Archived
 * (`projectTaskStatusSections`: Idle in project order, the rest latest run
 * first; Archived starts folded), with the compact project task rows
 * (`ProjectTaskRow`; a locked row for a task in a repo the reader cannot
 * open). Blocked, where new and unapproved tasks wait, carries Approve
 * (every todo task nobody approved yet, for a contributor) and "+" (a new
 * task; feedback for a viewer). A tap opens the task.
 */
export function ProjectTasks({
  project,
  repo,
  users,
  tasks,
  failedTaskIds,
  canContribute,
  onFeedback,
}: {
  project: Project;
  repo: Repo;
  users: User[] | undefined;
  /** `agentTasks.listByProject`, undefined while it loads (`useProjectTaskStatus`). */
  tasks: ProjectTaskListRow[] | undefined;
  failedTaskIds: ReadonlySet<string>;
  /** The reader may approve, cancel and run (`callerRole`). */
  canContribute: boolean;
  onFeedback: () => void;
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
        sections={projectTaskStatusSections(tasks, failedTaskIds).map((section) => {
          const open = section.defaultOpen !== toggled.has(section.status);
          return { status: section.status, count: section.tasks.length, open, data: open ? section.tasks : [] };
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
                section.status === "blocked" ? (
                  <View className="mr-1 flex-row items-center gap-1">
                    {toApprove.length > 0 ? (
                      <Button
                        size="sm"
                        fullWidth={false}
                        loading={approving}
                        disabled={approving}
                        leftIcon={<IconCheck size={14} color={EVA_THEME[scheme].primaryForeground} />}
                        onPress={approveAll}
                      >
                        Approve
                      </Button>
                    ) : null}
                    {/* The web outline "+" on Blocked: a 44 square here, in place of the web 24. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={canContribute ? "New task" : "Feedback"}
                      onPress={canContribute ? openNewTask : onFeedback}
                      className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
                    >
                      <IconPlus size={14} color={muted} />
                    </Pressable>
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
            notes={notesByTask.get(row._id)}
            hasError={failedTaskIds.has(row._id)}
            hasDraftComment={draftTaskIds.has(row._id)}
            projectNumId={project.numId}
            homeRepoId={project.repoId}
            reposById={reposById}
            canContribute={canContribute}
            onLongPress={() => actions.openSheet(row)}
          />
        )}
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
