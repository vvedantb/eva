"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, normalizeAIModel } from "@eva/backend";
import type { Doc, Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import type { FunctionReturnType } from "convex/server";
import type { TaskStatus } from "../TaskStatusBadge";
import { FieldsSection } from "@/lib/components/fields/FieldsSection";
import { taskModelLockReason } from "@eva/shared/taskDetail";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  useAvailableAiModels,
  useTaskOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { LabelsField } from "@/lib/components/labels/LabelsField";
import { NewProjectModal } from "@/lib/components/projects/NewProjectModal";
import { useViewVercelDeployment } from "@/lib/hooks/useViewVercelDeployment";
import {
  BaseBranchRow,
  DeploymentRow,
  ModelField,
  PrioritySelectField,
  ProjectSelectField,
  ReviewerSelectField,
  StatusSelectField,
} from "./StatusFieldsControls";

type RunDoc = NonNullable<
  FunctionReturnType<typeof api.agentRuns.listByTask>
>[number];

interface StatusFieldsSectionProps {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks"> | undefined;
  status: TaskStatus | undefined;
  users: FunctionReturnType<typeof api.users.listAll> | undefined;
  projects: FunctionReturnType<typeof api.projects.list> | undefined;
  /** Derived from the task row, not mirrored state — see `useTaskDetail`. */
  baseBranch: string;
  /** Status row is shown behind the `viewVercelDeployment` experimental flag. */
  latestDeployment: RunDoc | undefined;
  /** Locks the model picker — the model that ran must stay on the record. */
  hasRuns: boolean;
  /** Only the task owner can move it onto their own provider account. */
  isOwner: boolean;
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
  latestDeployment,
  hasRuns,
  isOwner,
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

        <TaskModelRow
          taskId={taskId}
          task={task}
          status={status}
          hasRuns={hasRuns}
          isOwner={isOwner}
          readOnly={readOnly}
        />

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
          latestDeployment={latestDeployment}
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
        providerAccountId,
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
        ...(providerAccountId !== undefined
          ? { providerAccountId: providerAccountId ?? undefined }
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

/**
 * A task's model and its account. Hidden in simple view. Locked once the
 * task ran, once it is done or cancelled, and while it is archived.
 */
function TaskModelRow({
  taskId,
  task,
  status,
  hasRuns,
  isOwner,
  readOnly,
}: {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks"> | undefined;
  status: TaskStatus | undefined;
  hasRuns: boolean;
  isOwner: boolean;
  readOnly: boolean;
}) {
  const simpleView = useSimpleView();
  const updateTask = useTaskUpdate(task);
  const currentModel = normalizeAIModel(task?.model);
  const { options: modelOptions } = useAvailableAiModels(
    task?.repoId,
    currentModel,
  );
  const { options: accounts, resolveId: resolveAccountId } =
    useTaskOwnerProviderAccounts(taskId);
  if (simpleView) return null;
  const modelLockReason = taskModelLockReason({ status, hasRuns, readOnly });
  return (
    <ModelField
      taskId={taskId}
      task={task}
      currentModel={currentModel}
      modelOptions={modelOptions}
      accounts={accounts}
      resolveAccountId={resolveAccountId}
      modelLockReason={modelLockReason}
      isOwner={isOwner}
      updateTask={updateTask}
    />
  );
}
