import { api, type Id } from "@eva/backend";
import { useTaskChatModel } from "@/quickTasks/useTaskChatModel";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectTaskPromptAction, WITH_COORDINATOR_LABEL } from "@eva/shared/projectView";
import { canEditTaskText, taskTextLockReason } from "@eva/shared/taskDetail";
import { Button } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useState } from "react";
import { Text, View } from "react-native";
import { UserAttachments } from "@/chat/media/UserAttachments";
import { useTaskReactions } from "@/quickTasks/TaskActivity";
import { TaskDescription, TaskTitle } from "@/quickTasks/TaskText";
import { useScheme, XS_TRACKING } from "@/ui/theme";
import type { ProjectTaskRow } from "./ProjectTaskFacts";

/**
 * The web `ProjectTaskPromptCard`: a project task's chat before its first run
 * (`showsProjectTaskPrompt`) shows its title, prompt and attachments, which
 * edit in place while the web allows it (`canEditTaskText`), then Start, or a
 * quiet "With Eva" while the coordinator places it (`projectTaskPromptAction`).
 */
export function ProjectTaskPromptCard({
  task,
  repoId,
  readOnly,
}: {
  task: ProjectTaskRow;
  repoId: Id<"githubRepos">;
  readOnly: boolean;
}) {
  const theme = EVA_THEME[useScheme()];
  const users = useQuery(api.users.listAll, {});
  const currentUserId = useQuery(api.auth.me, {});
  const runFacts = useQuery(api.agentTasks.getRunFacts, { taskId: task._id });
  const attachments = useQuery(api.agentTasks.listAttachments, { taskId: task._id });
  const reactionsFor = useTaskReactions(task._id, users, currentUserId);
  const taskModel = useTaskChatModel(task._id);
  const updateTask = useMutation(api.agentTasks.update);
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [busy, setBusy] = useState(false);
  const hasActiveRun = runFacts?.hasActiveRun ?? false;
  const editable = !readOnly && runFacts !== undefined && canEditTaskText(task.status, hasActiveRun);
  const action = runFacts === undefined ? undefined : projectTaskPromptAction(task, { hasActiveRun, readOnly });
  const update = (fields: Omit<FunctionArgs<typeof api.agentTasks.update>, "id">, failure: string) => {
    updateTask({ id: task._id, ...fields }).catch(() => toast.error(failure));
  };
  const act = <Result,>(write: Promise<Result>, failure: string) => {
    setBusy(true);
    write.catch(() => toast.error(failure)).finally(() => setBusy(false));
  };
  return (
    <View className="gap-3 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
      <TaskTitle
        title={task.title}
        editable={editable}
        lockReason={runFacts === undefined ? undefined : taskTextLockReason(hasActiveRun, "Title")}
        onSave={(title) => update({ title }, "Couldn't rename the task")}
      />
      <TaskDescription
        description={task.description}
        repoId={repoId}
        model={taskModel}
        editable={editable}
        reactions={reactionsFor("description", task._id)}
        onSave={(description) => update({ description }, "Couldn't save the description")}
      />
      {attachments && attachments.length > 0 ? (
        <UserAttachments
          attachments={attachments.flatMap((entry) => (entry.url ? [{ url: entry.url, contentType: entry.contentType }] : []))}
        />
      ) : null}
      {action === "with_eva" ? (
        <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground, letterSpacing: XS_TRACKING }}>
          {WITH_COORDINATOR_LABEL}
        </Text>
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
