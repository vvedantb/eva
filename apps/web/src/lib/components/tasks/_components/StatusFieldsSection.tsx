"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc, Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import type { FunctionReturnType } from "convex/server";
import type { TaskStatus } from "../TaskStatusBadge";
import {
  FIELD_ROW_CLASS,
  FIELD_TEXT_CLASS,
  FieldsSection,
} from "@/lib/components/fields/FieldsSection";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { useTaskChatBinding } from "../TaskSandboxChatPanel";
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
  baseBranch: string;
  deploymentStatus: TaskDeploymentStatus;
  allTags: string[];
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

        <TaskModelRow taskId={taskId} disabled={readOnly} />

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

function TaskModelRow({
  taskId,
  disabled,
}: {
  taskId: Id<"agentTasks">;
  disabled: boolean;
}) {
  const binding = useTaskChatBinding(taskId);
  return (
    <div className={FIELD_ROW_CLASS}>
      <ModelSelectWithTraits
        value={binding.model}
        options={binding.modelOptions}
        onValueChange={binding.setModel}
        accounts={binding.accounts}
        accountId={binding.providerAccountId ?? null}
        onAccountChange={(next) =>
          void binding.switchProviderAccount(
            binding.resolveAccountId(next) ?? null,
          )
        }
        traits={binding.displayTraits}
        onTraitsChange={binding.onTraitsChange}
        disabled={disabled || binding.isSwitchingAccount}
        className={`px-0 ${FIELD_TEXT_CLASS}`}
      />
    </div>
  );
}

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
