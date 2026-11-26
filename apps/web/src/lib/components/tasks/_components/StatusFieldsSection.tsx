"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc, Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import type { FunctionReturnType } from "convex/server";
import type { TaskStatus } from "../TaskStatusBadge";
import { FieldsSection } from "@/lib/components/fields/FieldsSection";
import { LabelsField } from "@/lib/components/labels/LabelsField";
import { NewProjectModal } from "@/lib/components/projects/NewProjectModal";
import { useViewVercelDeployment } from "@/lib/hooks/useViewVercelDeployment";
import {
  BaseBranchRow,
  DeploymentRow,
  PrioritySelectField,
  ProjectSelectField,
  ReviewerSelectField,
  StatusSelectField,
  type TaskDeploymentStatus,
} from "./StatusFieldsControls";


interface StatusFieldsSectionProps {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks"> | undefined;
  status: TaskStatus | undefined;
  users: FunctionReturnType<typeof api.users.listAll> | undefined;
  projects: FunctionReturnType<typeof api.projects.list> | undefined;
  /** Derived from the task row, not mirrored state — see `useTaskDetail`. */
  baseBranch: string;
  /** Status row is shown behind the `viewVercelDeployment` experimental flag. */
  deploymentStatus: TaskDeploymentStatus;
  allTags: string[];
  /** An archived task (or one in an archived project): every field is disabled. */
  readOnly: boolean;
}

export function StatusFieldsSection({
  taskId,
  task,
  status,
  users,
  projects,
  baseBranch,
  deploymentStatus,
  allTags,
  readOnly,
}: StatusFieldsSectionProps) {
  const viewVercelDeployment = useViewVercelDeployment();
  const updateTask = useTaskUpdate(task);
  const updateStatus = useMutation(
    api.agentTasks.updateStatus,
  ).withOptimisticUpdate((localStore, args) => {
    if (!task?.repoId) return;
    patchLoadedQuery(
      localStore,
      api.agentTasks.getAllTasks,
      { repoId: task.repoId },
      (list) =>
        list.map((t) => (t._id === args.id ? { ...t, status: args.status } : t)),
    );
    patchLoadedQuery(
      localStore,
      api.agentTasks.get,
      { id: args.id },
      (cached) => cached && { ...cached, status: args.status },
    );
  });
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const projectOptions = projects ?? [];

  return (
    <div className="space-y-4">
      <FieldsSection title="Properties">
        <StatusSelectField
          taskId={taskId}
          status={status}
          updateStatus={updateStatus}
          disabled={readOnly}
        />

        <PrioritySelectField
          taskId={taskId}
          priority={task?.priority}
          updateTask={updateTask}
          disabled={readOnly}
        />

        <ReviewerSelectField
          taskId={taskId}
          assignedTo={task?.assignedTo}
          users={users}
          updateTask={updateTask}
          disabled={readOnly}
        />

        {/* No model row: a task runs on the model in its chat's composer. */}

        <BaseBranchRow
          taskId={taskId}
          hasProject={Boolean(task?.projectId)}
          status={status}
          baseBranch={baseBranch}
          updateTask={updateTask}
          disabled={readOnly}
        />

        <DeploymentRow
          viewVercelDeployment={viewVercelDeployment}
          deploymentStatus={deploymentStatus}
        />
      </FieldsSection>

      <FieldsSection title="Labels">
        <LabelsField
          tags={task?.tags}
          allTags={allTags}
          onChange={(tags) => updateTask({ id: taskId, tags })}
          disabled={readOnly}
        />
      </FieldsSection>

      <FieldsSection title="Project">
        <ProjectSelectField
          taskId={taskId}
          projectId={task?.projectId}
          projectOptions={projectOptions}
          onCreateProject={() => setIsCreatingProject(true)}
          updateTask={updateTask}
          disabled={readOnly}
        />
        <NewProjectModal
          isOpen={isCreatingProject}
          onClose={() => setIsCreatingProject(false)}
          onCreated={(id) => updateTask({ id: taskId, projectId: id })}
        />
      </FieldsSection>
    </div>
  );
}

/**
 * `agentTasks.update`, shown at once in the repo's task list and the task
 * itself before the server confirms it.
 */
function useTaskUpdate(task: Doc<"agentTasks"> | undefined) {
  return useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      if (!task?.repoId) return;
      const {
        id: _id,
        repoId: _repoId,
        priority,
        projectId,
        assignedTo,
        ...safeFields
      } = args;
      const nullSafe = {
        ...safeFields,
        ...(priority !== undefined ? { priority: priority ?? undefined } : {}),
        ...(projectId !== undefined
          ? { projectId: projectId ?? undefined }
          : {}),
        ...(assignedTo !== undefined
          ? { assignedTo: assignedTo ?? undefined }
          : {}),
      };
      patchLoadedQuery(
        localStore,
        api.agentTasks.getAllTasks,
        { repoId: task.repoId },
        (list) =>
          list.map((t) => (t._id === args.id ? { ...t, ...nullSafe } : t)),
      );
      patchLoadedQuery(
        localStore,
        api.agentTasks.get,
        { id: args.id },
        (cached) => cached && { ...cached, ...nullSafe },
      );
    },
  );
}
