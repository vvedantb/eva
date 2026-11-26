import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectTaskPromptAction } from "@eva/shared/projectView";
import { canEditTaskText, taskTextLockReason } from "@eva/shared/taskDetail";
import { Button } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useState } from "react";
import { View } from "react-native";
import { UserAttachments } from "@/chat/media/UserAttachments";
import { useTaskReactions } from "@/quickTasks/TaskActivity";
import { TaskDescription, TaskTitle } from "@/quickTasks/TaskText";
import { useScheme } from "@/ui/theme";
import type { ProjectTaskRow } from "./ProjectTaskFacts";

/**
 * The web `ProjectTaskPromptCard`: a project task's chat before its first run
 * (`showsProjectTaskPrompt`) shows its title, prompt and attachments, which
 * edit in place while the web allows it (`canEditTaskText`), then Approve in
 * Triage or Start once approved (`projectTaskPromptAction`).
 */
export function ProjectTaskPromptCard({
  task,
  repoId,
  readOnly,
}: {
  task: ProjectTaskRow;
  repoId: Id<"githubRepos">;
  /** The task or its project is archived. */
  readOnly: boolean;
}) {
  const theme = EVA_THEME[useScheme()];
  const users = useQuery(api.users.listAll, {});
  const currentUserId = useQuery(api.auth.me, {});
  const runs = useQuery(api.agentRuns.listByTask, { taskId: task._id });
  const attachments = useQuery(api.agentTasks.listAttachments, { taskId: task._id });
  const reactionsFor = useTaskReactions(task._id, users, currentUserId);
  const updateTask = useMutation(api.agentTasks.update);
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [busy, setBusy] = useState(false);
  const hasActiveRun = runs?.some((run) => run.status === "queued" || run.status === "running") ?? false;
  const editable = !readOnly && runs !== undefined && canEditTaskText(task.status, hasActiveRun);
  const action = runs === undefined ? undefined : projectTaskPromptAction(task, { hasActiveRun, readOnly });
  const update = (fields: Omit<FunctionArgs<typeof api.agentTasks.update>, "id">, failure: string) => {
    updateTask({ id: task._id, ...fields }).catch(() => toast.error(failure));
  };
  const act = <Result,>(write: Promise<Result>, failure: string) => {
    setBusy(true);
    write.catch(() => toast.error(failure)).finally(() => setBusy(false));
  };
  const { projectId } = task;
  return (
    <View className="gap-3 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
      <TaskTitle
        title={task.title}
        editable={editable}
        lockReason={runs === undefined ? undefined : taskTextLockReason(hasActiveRun, "Title")}
        onSave={(title) => update({ title }, "Couldn't rename the task")}
      />
      <TaskDescription
        description={task.description}
        repoId={repoId}
        model={task.model}
        editable={editable}
        reactions={reactionsFor("description", task._id)}
        onSave={(description) => update({ description }, "Couldn't save the description")}
      />
      {attachments && attachments.length > 0 ? (
        <UserAttachments
          attachments={attachments.flatMap((entry) => (entry.url ? [{ url: entry.url, contentType: entry.contentType }] : []))}
        />
      ) : null}
      {action === "approve" && projectId !== undefined ? (
        <Button
          size="sm"
          fullWidth={false}
          loading={busy}
          disabled={busy}
          onPress={() => act(approveTasks({ projectId, taskIds: [task._id] }), "Couldn't approve the task")}
        >
          Approve
        </Button>
      ) : action === "start" ? (
        <Button
          size="sm"
          fullWidth={false}
          loading={busy}
          disabled={busy}
          onPress={() => act(startExecution({ id: task._id }), "Couldn't start the task")}
        >
          Start
        </Button>
      ) : null}
    </View>
  );
}
