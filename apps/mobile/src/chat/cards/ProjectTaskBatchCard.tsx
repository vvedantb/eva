import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectTaskView, unapprovedTodoTaskIds } from "@eva/shared/projectView";
import { IconCheck } from "@tabler/icons-react-native";
import { Button } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Text, View } from "react-native";
import { ProjectTaskRow } from "@/projects/ProjectTaskRow";
import { useProjectTaskNotes, useProjectTaskStatus } from "@/projects/useProjectStatus";
import { useScheme } from "@/ui/theme";
import { CardSurface } from "./AgentRequestCards";

export type ProjectTaskBatch = FunctionReturnType<typeof api.projects.listTaskBatches>[number];
type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;

/**
 * The tasks one coordinator call proposed (`projects.listTaskBatches`), live,
 * in the coordinator chat under the turn that proposed them, as the web
 * `ProjectTaskBatchCard`. The rows are the project task list's rows
 * (`ProjectTaskRow`, from `listByProject`), so the card and the list always
 * agree. A contributor approves the batch's unapproved todo tasks with one
 * Approve, or cancels a task beside its row; a viewer reads the card only.
 * A tap on a task opens it.
 */
export function ProjectTaskBatchCard({ batch }: { batch: ProjectTaskBatch }) {
  const project = useQuery(api.projects.get, { id: batch.projectId });
  if (!project) return null;
  return <BatchCard batch={batch} project={project} />;
}

function BatchCard({ batch, project }: { batch: ProjectTaskBatch; project: Project }) {
  const theme = EVA_THEME[useScheme()];
  const { tasks, failedTaskIds } = useProjectTaskStatus(project._id, project.repoId);
  const notesByTask = useProjectTaskNotes(project._id);
  const repos = useQuery(api.githubRepos.list, {});
  const approveTasks = useMutation(api.buildWorkflow.approveProjectTasks);
  const [approving, setApproving] = useState(false);
  const canContribute = project.callerRole === "contributor";
  const taskById = new Map((tasks ?? []).map((task) => [String(task._id), task]));
  const batchTasks = batch.taskIds.flatMap((id) => {
    const task = taskById.get(String(id));
    return task ? [task] : [];
  });
  const toApprove = canContribute ? unapprovedTodoTaskIds(batchTasks) : [];
  const reposById = new Map((repos ?? []).map((entry) => [String(entry._id), entry]));

  const approve = () => {
    setApproving(true);
    approveTasks({ projectId: project._id, taskIds: toApprove })
      .then(
        () => toast.success(toApprove.length === 1 ? "Task approved" : "Tasks approved"),
        () => toast.error("Couldn't approve the tasks"),
      )
      .then(() => setApproving(false));
  };

  if (batchTasks.length === 0) return null;
  return (
    <CardSurface testID="project-task-batch-card">
      <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
        Proposed tasks
      </Text>
      <View className="gap-1">
        {batchTasks.map((task) => {
          const view = projectTaskView(task, failedTaskIds.has(task._id));
          return (
            <ProjectTaskRow
              key={task._id}
              task={task}
              view={view}
              showStatus
              notes={notesByTask.get(task._id)}
              hasError={failedTaskIds.has(task._id)}
              hasDraftComment={false}
              projectNumId={project.numId}
              homeRepoId={project.repoId}
              reposById={reposById}
              canContribute={canContribute}
            />
          );
        })}
      </View>
      {toApprove.length > 0 ? (
        <Button
          loading={approving}
          disabled={approving}
          leftIcon={<IconCheck size={16} color={theme.primaryForeground} />}
          onPress={approve}
        >
          Approve
        </Button>
      ) : null}
    </CardSurface>
  );
}
