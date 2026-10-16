"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, normalizeAIModel } from "@eva/backend";
import type { Doc, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import type { TaskStatus } from "../TaskStatusBadge";
import { FieldsSection } from "@/lib/components/fields/FieldsSection";
import { canEditTaskModel } from "./task-detail-constants";
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
  isBlocked: boolean | undefined;
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
}

export function StatusFieldsSection({
  taskId,
  task,
  status,
  isBlocked,
  users,
  projects,
  baseBranch,
  latestDeployment,
  hasRuns,
  isOwner,
  allTags,
}: StatusFieldsSectionProps) {
  const viewVercelDeployment = useViewVercelDeployment();
  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate(
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
      const list = localStore.getQuery(api.agentTasks.getAllTasks, {
        repoId: task.repoId,
      });
      if (list !== undefined) {
        localStore.setQuery(
          api.agentTasks.getAllTasks,
          { repoId: task.repoId },
          list.map((t) => (t._id === args.id ? { ...t, ...nullSafe } : t)),
        );
      }
      const cached = localStore.getQuery(api.agentTasks.get, { id: args.id });
      if (cached) {
        localStore.setQuery(
          api.agentTasks.get,
          { id: args.id },
          {
            ...cached,
            ...nullSafe,
          },
        );
      }
    },
  );
  const updateStatus = useMutation(
    api.agentTasks.updateStatus,
  ).withOptimisticUpdate((localStore, args) => {
    if (!task?.repoId) return;
    const list = localStore.getQuery(api.agentTasks.getAllTasks, {
      repoId: task.repoId,
    });
    if (list !== undefined) {
      localStore.setQuery(
        api.agentTasks.getAllTasks,
        { repoId: task.repoId },
        list.map((t) =>
          t._id === args.id ? { ...t, status: args.status } : t,
        ),
      );
    }
    const cached = localStore.getQuery(api.agentTasks.get, { id: args.id });
    if (cached) {
      localStore.setQuery(
        api.agentTasks.get,
        { id: args.id },
        {
          ...cached,
          status: args.status,
        },
      );
    }
  });
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const projectOptions = projects ?? [];
  const currentModel = normalizeAIModel(task?.model);
  const { options: modelOptions } = useAvailableAiModels(
    task?.repoId,
    currentModel,
  );
  const { options: accounts, resolveId: resolveAccountId } =
    useTaskOwnerProviderAccounts(taskId);
  const modelLockReason = hasRuns
    ? "Cannot be changed after the task has run"
    : !canEditTaskModel(status)
      ? "Locked when the task is done or cancelled"
      : undefined;

  return (
    <div className="space-y-4">
      <FieldsSection title="Properties">
        <StatusSelectField
          taskId={taskId}
          status={status}
          isBlocked={isBlocked}
          updateStatus={updateStatus}
        />

        <PrioritySelectField
          taskId={taskId}
          priority={task?.priority}
          updateTask={updateTask}
        />

        <ReviewerSelectField
          taskId={taskId}
          assignedTo={task?.assignedTo}
          users={users}
          updateTask={updateTask}
        />

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

        <BaseBranchRow
          taskId={taskId}
          hasProject={Boolean(task?.projectId)}
          status={status}
          baseBranch={baseBranch}
          updateTask={updateTask}
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
        />
      </FieldsSection>

      <FieldsSection title="Project">
        <ProjectSelectField
          taskId={taskId}
          projectId={task?.projectId}
          projectOptions={projectOptions}
          onCreateProject={() => setIsCreatingProject(true)}
          updateTask={updateTask}
        />
        <NewProjectModal
          isOpen={isCreatingProject}
          onClose={() => setIsCreatingProject(false)}
          onCreated={(id) => updateTask({ id: taskId, projectId: id })}
          defaultSkipPlanning
        />
      </FieldsSection>
    </div>
  );
}
