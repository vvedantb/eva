import { api, type Id } from "@eva/backend";
import { formatEntityNumLabel } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { isUnapprovedTodoTask, projectTaskOriginLabel, type ProjectTaskNotes, type ProjectTaskView } from "@eva/shared/projectView";
import { IconLock } from "@tabler/icons-react-native";
import { Button, SurfaceRow } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Text, View } from "react-native";
import { taskDisplayStatusAppearance } from "@/projects/phaseAppearance";
import { hasProjectTaskBadges, ProjectTaskBadges, type ProjectTaskBadgeFacts } from "@/projects/ProjectTaskBadges";
import type { ProjectTaskListRow } from "@/projects/useProjectStatus";
import { META_TEXT, MetaPill, QuickTaskRow } from "@/quickTasks/QuickTaskRow";
import type { RepoRow } from "@/sessions/SessionGroup";
import { useScheme } from "@/ui/theme";

/**
 * One compact row of a project's task list, as the web `ProjectTaskRow`:
 * the compact quick-task card numbered "#project/task", striped by the
 * task's display status (`projectTaskDisplayStatus`), with the project task
 * badges. A Triage row names its origin (`projectTaskOriginLabel`) in place
 * of the Feedback and "Needs approval" badges, and a contributor rejects or
 * approves it with the buttons beside it (the row itself is one button). A
 * long press opens the task menu (`onLongPress`); a viewer gets neither. A
 * task in a repo the reader cannot open is a locked row.
 */
export function ProjectTaskRow({
  task,
  view,
  authorName,
  notes,
  hasError,
  hasDraftComment,
  projectId,
  projectNumId,
  homeRepoId,
  reposById,
  canContribute,
  onLongPress,
}: {
  task: ProjectTaskListRow;
  view: ProjectTaskView;
  /** The first name of the person who wrote a feedback task (`createdBy`). */
  authorName: string | undefined;
  /** The task's open question and open reports (`useProjectTaskNotes`). */
  notes: ProjectTaskNotes | undefined;
  hasError: boolean;
  hasDraftComment: boolean;
  projectId: Id<"projects">;
  projectNumId: number | undefined;
  homeRepoId: Id<"githubRepos">;
  reposById: ReadonlyMap<string, RepoRow>;
  canContribute: boolean;
  onLongPress?: () => void;
}) {
  const scheme = useScheme();
  const appearance = taskDisplayStatusAppearance(view.displayStatus, scheme);
  if (task.locked === true) return <LockedTaskRow taskNumber={task.taskNumber} projectNumId={projectNumId} accentColor={appearance.bar} />;
  const triage = view.displayStatus === "triage";
  const badges: ProjectTaskBadgeFacts = {
    // A Triage row's origin line says it waits for approval.
    needsYou: view.needsYou === "approve" ? undefined : view.needsYou,
    waitingForCoordinator: view.waitingForCoordinator,
    ask: notes?.ask,
    reports: notes?.reports ?? [],
    phaseLabel: task.phaseLabel,
    isFeedback: !triage && task.origin === "feedback",
    repo: task.repoId !== undefined && task.repoId !== homeRepoId ? reposById.get(String(task.repoId)) : undefined,
    hasPr: task.prUrl !== undefined,
    prState: task.prState,
  };
  const canTriage = canContribute && triage && isUnapprovedTodoTask(task);
  return (
    <View className="flex-row items-center gap-1">
      <View className="min-w-0 flex-1">
        <QuickTaskRow
          task={task}
          // A draft task sits in To Do, striped as To Do.
          status={task.status === "draft" ? "todo" : task.status}
          hasError={hasError}
          hasDraftComment={hasDraftComment}
          creator={undefined}
          projectNumId={projectNumId}
          onLongPress={canContribute ? onLongPress : undefined}
          compact
          accentColor={appearance.bar}
          badges={
            triage || hasProjectTaskBadges(badges) ? (
              <>
                {triage ? <MetaPill label={projectTaskOriginLabel(task.origin, authorName)} /> : null}
                <ProjectTaskBadges badges={badges} />
              </>
            ) : undefined
          }
        />
      </View>
      {canTriage ? <TriageButtons projectId={projectId} taskId={task._id} /> : null}
    </View>
  );
}

/**
 * A task in a repo the reader cannot open: its status stripe, its number and
 * a lock, no title. A tap says why, as the web tooltip.
 */
function LockedTaskRow({
  taskNumber,
  projectNumId,
  accentColor,
}: {
  taskNumber: number | undefined;
  projectNumId: number | undefined;
  accentColor: string;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const muted = theme.mutedForeground;
  const numLabel = formatEntityNumLabel({ numId: taskNumber, projectNumId });
  return (
    <SurfaceRow
      accessibilityLabel={numLabel ? `Locked task ${numLabel}` : "Locked task"}
      accessibilityHint="You do not have access to this repo"
      accentColor={accentColor}
      backgroundColor={theme.card}
      className="min-h-11 flex-row items-center gap-1.5 px-3 py-2 pl-3.5"
      onPress={() => toast("You do not have access to this repo")}
    >
      {numLabel ? (
        <Text style={{ ...META_TEXT, fontFamily: "monospace", color: withAlpha(muted, 0.55), fontVariant: ["tabular-nums"] }}>{numLabel}</Text>
      ) : null}
      <IconLock size={14} color={muted} />
    </SurfaceRow>
  );
}

/**
 * A Triage row's Reject (cancels the task) and Approve (lets the scheduler
 * start it), beside the card as the row is one button.
 */
function TriageButtons({ projectId, taskId }: { projectId: Id<"projects">; taskId: Id<"agentTasks"> }) {
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [busy, setBusy] = useState(false);
  const run = <Result,>(action: Promise<Result>, error: string) => {
    setBusy(true);
    action.catch(() => toast.error(error)).finally(() => setBusy(false));
  };
  return (
    <View className="flex-row items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        fullWidth={false}
        disabled={busy}
        onPress={() => run(updateStatus({ id: taskId, status: "cancelled" }), "Couldn't reject the task")}
      >
        Reject
      </Button>
      <Button
        size="sm"
        fullWidth={false}
        disabled={busy}
        onPress={() => run(approveTasks({ projectId, taskIds: [taskId] }), "Couldn't approve the task")}
      >
        Approve
      </Button>
    </View>
  );
}
