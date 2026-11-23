import { api, type Id } from "@eva/backend";
import { formatEntityNumLabel } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectTaskWaitsForCoordinator, type NeedsYouReason } from "@eva/shared/projectStatus";
import { PROJECT_TASK_STAGE_LABELS, projectTaskStageSections, unapprovedTodoTaskIds } from "@eva/shared/projectView";
import { IconCheck, IconLock, IconPlus, IconX } from "@tabler/icons-react-native";
import { Button, SkeletonList, SkeletonRow, SurfaceRow } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { taskStageAppearance } from "@/projects/phaseAppearance";
import { hasProjectTaskBadges, ProjectTaskBadges } from "@/projects/ProjectTaskBadges";
import type { ProjectTaskListRow } from "@/projects/useProjectStatus";
import { META_TEXT, QuickTaskRow } from "@/quickTasks/QuickTaskRow";
import { persistedIdSet } from "@/storage/persistedStore";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { CardGap, FoldFooter, FoldHeader } from "@/ui/FoldHeader";
import { useScheme } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

/** A project's task stage groups folded away from their default, kept on the device. */
const toggledProjectTaskStatuses = persistedIdSet("projectTaskStatusesToggled");

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The web project Tasks tab (`ProjectTaskListPanel`) at phone width: a
 * collapsible section per derived task stage in workflow order
 * (`projectTaskStageSections`: To Do in project order, the rest latest run
 * first; live sections start open), with the quick-task cards numbered
 * "#project/task" and the web task badges (needs you, waiting for the
 * coordinator, phase, feedback, other repo, PR). A task in a repo the reader
 * cannot open is a locked row: its number and a lock. To Do carries Approve
 * (every todo task nobody approved yet) and "+" (a new task; feedback for a
 * viewer). A contributor cancels an unapproved todo task with the X beside
 * it, and a long press opens the web task card menu (`useQuickTaskActions`);
 * a viewer gets neither. A tap opens the task. Not here from the web: drag
 * to reorder To Do.
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
          <View className="mb-2 rounded-lg" style={{ backgroundColor: EVA_THEME[scheme].card }}>
            <SkeletonRow index={row} lines={2} trailing={false} minHeight={72} className="px-3" />
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

  const renderTask = (task: ProjectTaskListRow, needsYou: NeedsYouReason | undefined) => {
    if (task.locked === true) return <LockedTaskRow taskNumber={task.taskNumber} projectNumId={project.numId} />;
    const otherRepo = task.repoId !== undefined && task.repoId !== project.repoId ? reposById.get(String(task.repoId)) : undefined;
    const badges = {
      needsYou,
      waitingForCoordinator: task.facts !== undefined && projectTaskWaitsForCoordinator(task.facts),
      phaseLabel: task.phaseLabel,
      isFeedback: task.origin === "feedback",
      repo: otherRepo,
      hasPr: task.prUrl !== undefined,
    };
    const canCancel = canContribute && task.status === "todo" && task.approvedAt === undefined;
    return (
      <View className="flex-row items-center gap-1">
        <View className="min-w-0 flex-1">
          <QuickTaskRow
            task={task}
            // A draft task sits in To Do, striped as To Do.
            status={task.status === "draft" ? "todo" : task.status}
            hasError={failedTaskIds.has(task._id)}
            hasDraftComment={draftTaskIds.has(task._id)}
            creator={users?.find((user) => user._id === task.createdBy)}
            projectNumId={project.numId}
            onLongPress={canContribute ? () => actions.openSheet(task) : undefined}
            badges={hasProjectTaskBadges(badges) ? <ProjectTaskBadges {...badges} prState={task.prState} /> : undefined}
          />
        </View>
        {canCancel ? <CancelTaskButton taskId={task._id} /> : null}
      </View>
    );
  };

  return (
    <>
      <SectionList
        {...LIST_WINDOW}
        sections={projectTaskStageSections(tasks, failedTaskIds).map((section) => {
          const open = section.defaultOpen !== toggled.has(section.stage);
          return { stage: section.stage, count: section.tasks.length, open, data: open ? section.tasks : [] };
        })}
        keyExtractor={(task) => task.row._id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => {
          const { icon, text } = taskStageAppearance(section.stage, scheme);
          return (
            <FoldHeader
              icon={icon}
              color={text}
              label={PROJECT_TASK_STAGE_LABELS[section.stage]}
              count={section.count}
              noun="task"
              open={section.open}
              onToggle={() => toggle(section.stage)}
              trailing={
                section.stage === "todo" ? (
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
                    {/* The web outline "+" on To Do: a 44 square here, in place of the web 24. */}
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
        ItemSeparatorComponent={CardGap}
        renderItem={({ item }) => renderTask(item.row, item.needsYou)}
        renderSectionFooter={({ section }) => <FoldFooter open={section.open} count={section.count} empty="No tasks" />}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
      />
      {actions.dialogs}
    </>
  );
}

/**
 * A task in a repo the reader cannot open: the To Do stripe, its number and
 * a lock, no title. A tap says why, as the web tooltip.
 */
function LockedTaskRow({ taskNumber, projectNumId }: { taskNumber: number | undefined; projectNumId: number | undefined }) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const muted = theme.mutedForeground;
  const numLabel = formatEntityNumLabel({ numId: taskNumber, projectNumId });
  return (
    <SurfaceRow
      accessibilityLabel={numLabel ? `Locked task ${numLabel}` : "Locked task"}
      accessibilityHint="You do not have access to this repo"
      accentColor={taskStageAppearance("todo", scheme).bar}
      backgroundColor={theme.card}
      className="min-h-12 flex-row items-center gap-1.5 px-3 py-3 pl-3.5"
      onPress={() => toast("You do not have access to this repo")}
    >
      {numLabel ? (
        <Text style={{ ...META_TEXT, fontFamily: "monospace", color: withAlpha(muted, 0.55), fontVariant: ["tabular-nums"] }}>{numLabel}</Text>
      ) : null}
      <IconLock size={14} color={muted} />
    </SurfaceRow>
  );
}

/** The web row's X on a todo task nobody approved: cancels (rejects) it, beside the card as the row is one button. */
export function CancelTaskButton({ taskId }: { taskId: Id<"agentTasks"> }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cancel task"
      onPress={() => {
        updateStatus({ id: taskId, status: "cancelled" }).catch(() => toast.error("Couldn't cancel the task"));
      }}
      className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
    >
      <IconX size={16} color={muted} />
    </Pressable>
  );
}
