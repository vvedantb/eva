import { api, type Id } from "@eva/backend";
import { formatEntityNumLabel } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { PROJECT_TASK_DISPLAY_STATUS_LABELS, type ProjectTaskNotes, type ProjectTaskView } from "@eva/shared/projectView";
import { IconLock, IconX } from "@tabler/icons-react-native";
import { SurfaceRow } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import { Pressable, Text, View } from "react-native";
import { taskDisplayStatusAppearance } from "@/projects/phaseAppearance";
import { hasProjectTaskBadges, ProjectTaskBadges, type ProjectTaskBadgeFacts } from "@/projects/ProjectTaskBadges";
import type { ProjectTaskListRow } from "@/projects/useProjectStatus";
import { META_TEXT, MetaPill, QuickTaskRow } from "@/quickTasks/QuickTaskRow";
import type { RepoRow } from "@/sessions/SessionGroup";
import { useScheme } from "@/ui/theme";

/**
 * One compact row of a project's task list, and of the coordinator chat's
 * task cards, as the web `ProjectTaskRow`: the compact quick-task card
 * numbered "#project/task", striped by the task's display status
 * (`projectTaskDisplayStatus`; `showStatus` names it where no section header
 * does), with the project task badges. A contributor cancels a todo
 * task nobody approved with the X beside it (the row itself is one button),
 * and a long press opens the task menu (`onLongPress`); a viewer gets
 * neither. A task in a repo the reader cannot open is a locked row.
 */
export function ProjectTaskRow({
  task,
  view,
  showStatus = false,
  notes,
  hasError,
  hasDraftComment,
  projectNumId,
  homeRepoId,
  reposById,
  canContribute,
  onLongPress,
}: {
  task: ProjectTaskListRow;
  view: ProjectTaskView;
  /** Name the display status in a badge (the chat card has no sections). */
  showStatus?: boolean;
  /** The task's open question and open reports (`useProjectTaskNotes`). */
  notes: ProjectTaskNotes | undefined;
  hasError: boolean;
  hasDraftComment: boolean;
  projectNumId: number | undefined;
  homeRepoId: Id<"githubRepos">;
  reposById: ReadonlyMap<string, RepoRow>;
  canContribute: boolean;
  onLongPress?: () => void;
}) {
  const scheme = useScheme();
  const appearance = taskDisplayStatusAppearance(view.displayStatus, scheme);
  const StatusIcon = appearance.icon;
  if (task.locked === true) return <LockedTaskRow taskNumber={task.taskNumber} projectNumId={projectNumId} accentColor={appearance.bar} />;
  const badges: ProjectTaskBadgeFacts = {
    needsYou: view.needsYou,
    waitingForCoordinator: view.waitingForCoordinator,
    ask: notes?.ask,
    reports: notes?.reports ?? [],
    phaseLabel: task.phaseLabel,
    isFeedback: task.origin === "feedback",
    repo: task.repoId !== undefined && task.repoId !== homeRepoId ? reposById.get(String(task.repoId)) : undefined,
    hasPr: task.prUrl !== undefined,
    prState: task.prState,
  };
  const canCancel = canContribute && task.status === "todo" && task.approvedAt === undefined;
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
            showStatus || hasProjectTaskBadges(badges) ? (
              <>
                {showStatus ? (
                  <MetaPill leading={<StatusIcon size={12} color={appearance.text} />} label={PROJECT_TASK_DISPLAY_STATUS_LABELS[view.displayStatus]} />
                ) : null}
                <ProjectTaskBadges badges={badges} />
              </>
            ) : undefined
          }
        />
      </View>
      {canCancel ? <CancelTaskButton taskId={task._id} /> : null}
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

/** The web row's X on a todo task nobody approved: cancels (rejects) it, beside the card as the row is one button. */
function CancelTaskButton({ taskId }: { taskId: Id<"agentTasks"> }) {
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
