"use client";

import type { ReactMutation } from "convex/react";
import type { api, Doc, Id, normalizeAIModel } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Badge,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconUserPlus,
  IconFolder,
  IconFolderPlus,
  IconGitBranch,
  IconInfoCircle,
  IconBrandVercelFilled,
} from "@tabler/icons-react";
import { getUserInitials } from "@eva/shared";
import { UserInitials } from "@eva/shared/user-initials";
import { Facehash } from "facehash";
import {
  statusConfig,
  TASK_STATUSES,
  type TaskStatus,
} from "../TaskStatusBadge";
import { PriorityIcon } from "@/lib/components/priority/PriorityIcon";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type Priority,
} from "@/lib/components/priority/priorityMeta";
import { BranchSelect } from "@/lib/components/BranchSelect";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { storedRunTraits, toRunTraitArgs } from "@/lib/utils/runTraits";
import {
  FIELD_ROW_CLASS,
  FIELD_TEXT_CLASS,
  FIELD_TRIGGER_CLASS,
} from "@/lib/components/fields/FieldsSection";
import {
  DEPLOYMENT_STATUS_CONFIG,
  getUserDisplayName,
  NO_PROJECT_VALUE,
  NEW_PROJECT_VALUE,
  NO_PRIORITY_VALUE,
  UNASSIGNED_VALUE,
} from "./task-detail-constants";
import type {
  useAvailableAiModels,
  useTaskOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";

type RunDoc = NonNullable<
  FunctionReturnType<typeof api.agentRuns.listByTask>
>[number];
type Users = FunctionReturnType<typeof api.users.listAll> | undefined;
type ProjectOptions = FunctionReturnType<typeof api.projects.list>;
type TaskDoc = Doc<"agentTasks"> | undefined;
type UpdateTask = ReactMutation<typeof api.agentTasks.update>;
type UpdateStatus = ReactMutation<typeof api.agentTasks.updateStatus>;

function StatusValue({
  status,
  isBlocked,
}: {
  status: TaskStatus;
  isBlocked: boolean | undefined;
}) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <div className="flex items-center gap-1.5">
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
          className={`flex items-center gap-1.5 ${config.text}`}
        >
          <Icon size={14} />
          <span>{config.label}</span>
        </m.span>
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {isBlocked ? (
          <m.span
            key="blocked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
            className="inline-flex"
          >
            <Badge variant="warning" className="ml-0.5">
              Blocked
            </Badge>
          </m.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function StatusSelectField({
  taskId,
  status,
  isBlocked,
  updateStatus,
}: {
  taskId: Id<"agentTasks">;
  status: TaskStatus | undefined;
  isBlocked: boolean | undefined;
  updateStatus: UpdateStatus;
}) {
  return (
    <Select
      value={status ?? ""}
      onValueChange={(val) => {
        const matched = TASK_STATUSES.find((s) => s === val);
        if (matched) {
          updateStatus({ id: taskId, status: matched });
        }
      }}
    >
      <SelectTrigger className={FIELD_TRIGGER_CLASS}>
        <SelectValue placeholder="Status">
          {status ? <StatusValue status={status} isBlocked={isBlocked} /> : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Status</SelectLabel>
          {TASK_STATUSES.map((s) => {
            const config = statusConfig[s];
            const Icon = config.icon;
            return (
              <SelectItem key={s} value={s}>
                <div className={`flex items-center gap-1.5 ${config.text}`}>
                  <Icon size={14} />
                  <span>{config.label}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function PrioritySelectField({
  taskId,
  priority,
  updateTask,
}: {
  taskId: Id<"agentTasks">;
  priority: Priority | undefined;
  updateTask: UpdateTask;
}) {
  return (
    <Select
      value={priority ?? NO_PRIORITY_VALUE}
      onValueChange={(val) => {
        if (val === NO_PRIORITY_VALUE) {
          updateTask({ id: taskId, priority: null });
          return;
        }
        const matched = PRIORITY_ORDER.find((p) => p === val);
        if (matched) {
          updateTask({ id: taskId, priority: matched });
        }
      }}
    >
      <SelectTrigger className={FIELD_TRIGGER_CLASS}>
        <SelectValue>
          <div
            className={`flex items-center gap-1.5 ${priority ? "" : "text-muted-foreground"}`}
          >
            <PriorityIcon level={priority} size={14} />
            <span>{priority ? PRIORITY_LABELS[priority] : "Priority"}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Priority</SelectLabel>
          <SelectItem value={NO_PRIORITY_VALUE}>
            <div className="flex items-center gap-1.5">
              <PriorityIcon level={undefined} size={14} />
              <span>No priority</span>
            </div>
          </SelectItem>
          {PRIORITY_ORDER.map((p: Priority) => (
            <SelectItem key={p} value={p}>
              <div className="flex items-center gap-1.5">
                <PriorityIcon level={p} size={14} />
                <span>{PRIORITY_LABELS[p]}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function ReviewerSelectField({
  taskId,
  assignedTo,
  users,
  updateTask,
}: {
  taskId: Id<"agentTasks">;
  assignedTo: Id<"users"> | undefined;
  users: Users;
  updateTask: UpdateTask;
}) {
  const assignedUser = assignedTo
    ? users?.find((u) => u._id === assignedTo)
    : undefined;
  const assignedDisplayName = assignedUser
    ? getUserDisplayName(assignedUser)
    : "Unnamed User";
  const reviewers = (users ?? []).filter((u) => u.role === "dev");

  return (
    <Select
      value={assignedTo ?? UNASSIGNED_VALUE}
      onValueChange={(val) => {
        if (val === UNASSIGNED_VALUE) {
          updateTask({ id: taskId, assignedTo: null });
        } else {
          const user = users?.find((u) => u._id === val);
          if (user) updateTask({ id: taskId, assignedTo: user._id });
        }
      }}
    >
      <SelectTrigger className={FIELD_TRIGGER_CLASS}>
        <SelectValue>
          <div
            className={`flex items-center gap-1.5 ${!assignedTo ? "text-muted-foreground" : ""}`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={assignedUser?._id ?? "unassigned"}
                className="inline-flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                {assignedUser ? (
                  <UserInitials user={assignedUser} size="sm" hideLastSeen />
                ) : (
                  <IconUserPlus size={14} className="text-muted-foreground" />
                )}
              </m.span>
            </AnimatePresence>
            <span data-pii={Boolean(assignedTo) || undefined}>
              {assignedTo ? assignedDisplayName : "Code Reviewer"}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Code Reviewer</SelectLabel>
          <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
          {reviewers.map((user) => (
            <SelectItem key={user._id} value={user._id}>
              <div className="flex items-center gap-1.5">
                <Facehash size={16} name={getUserInitials(user)} enableBlink />
                <span data-pii>{getUserDisplayName(user)}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function ModelField({
  taskId,
  task,
  currentModel,
  modelOptions,
  accounts,
  resolveAccountId,
  modelLockReason,
  isOwner,
  updateTask,
}: {
  taskId: Id<"agentTasks">;
  task: TaskDoc;
  currentModel: ReturnType<typeof normalizeAIModel>;
  modelOptions: ReturnType<typeof useAvailableAiModels>["options"];
  accounts: ReturnType<typeof useTaskOwnerProviderAccounts>["options"];
  resolveAccountId: ReturnType<
    typeof useTaskOwnerProviderAccounts
  >["resolveId"];
  modelLockReason: string | undefined;
  isOwner: boolean;
  updateTask: UpdateTask;
}) {
  return (
    <div className={FIELD_ROW_CLASS}>
      <ModelSelectWithTraits
        value={currentModel}
        options={modelOptions}
        onValueChange={() => undefined}
        accounts={accounts}
        accountId={task?.providerAccountId ?? null}
        onSelectionChange={(nextModel, nextAccountId) => {
          if (modelLockReason) return;
          if (isOwner) {
            updateTask({
              id: taskId,
              model: nextModel,
              providerAccountId: resolveAccountId(nextAccountId) ?? null,
            });
            return;
          }
          updateTask({ id: taskId, model: nextModel });
        }}
        canSelectTeamWhilePersonal={isOwner}
        disabled={modelLockReason !== undefined}
        traits={storedRunTraits(task)}
        onTraitsChange={(partial) =>
          updateTask({ id: taskId, ...toRunTraitArgs(partial) })
        }
        className={`px-0 ${FIELD_TEXT_CLASS}`}
      />
      {modelLockReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <IconInfoCircle
              size={12}
              className="cursor-help text-muted-foreground"
            />
          </TooltipTrigger>
          <TooltipContent>{modelLockReason}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function BaseBranchRow({
  taskId,
  hasProject,
  status,
  baseBranch,
  updateTask,
}: {
  taskId: Id<"agentTasks">;
  hasProject: boolean;
  status: TaskStatus | undefined;
  baseBranch: string;
  updateTask: UpdateTask;
}) {
  return (
    <AnimatePresence initial={false}>
      {!hasProject ? (
        <m.div
          key="base-branch"
          className={FIELD_ROW_CLASS}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          {status === "todo" ? (
            <BranchSelect
              value={baseBranch}
              onValueChange={(val) => {
                updateTask({ id: taskId, baseBranch: val });
              }}
              className={`h-7 border-0 shadow-none bg-transparent px-0 hover:bg-transparent [&>svg:last-child]:hidden ${FIELD_TEXT_CLASS}`}
            />
          ) : (
            <div className={`flex items-center gap-1.5 ${FIELD_TEXT_CLASS}`}>
              <IconGitBranch size={14} className="text-muted-foreground" />
              <span>{baseBranch}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconInfoCircle
                    size={12}
                    className="text-muted-foreground cursor-help"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  Cannot be modified after task has run
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

export function DeploymentRow({
  viewVercelDeployment,
  latestDeployment,
}: {
  viewVercelDeployment: boolean;
  latestDeployment: RunDoc | undefined;
}) {
  return (
    <AnimatePresence initial={false}>
      {viewVercelDeployment && latestDeployment?.deploymentStatus ? (
        <m.div
          key="vercel-deployment"
          className={`${FIELD_ROW_CLASS} gap-1.5 ${FIELD_TEXT_CLASS}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          <IconBrandVercelFilled
            size={14}
            className={
              DEPLOYMENT_STATUS_CONFIG[latestDeployment.deploymentStatus]
                ?.iconColor ?? "text-muted-foreground"
            }
          />
          <span>
            {DEPLOYMENT_STATUS_CONFIG[latestDeployment.deploymentStatus]
              ?.label ?? "Unknown"}
          </span>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ProjectSelectField({
  taskId,
  projectId,
  projectOptions,
  onCreateProject,
  updateTask,
}: {
  taskId: Id<"agentTasks">;
  projectId: Id<"projects"> | undefined;
  projectOptions: ProjectOptions;
  onCreateProject: () => void;
  updateTask: UpdateTask;
}) {
  const hasSelectedProject =
    projectId !== undefined &&
    projectOptions.some((project) => project._id === projectId);
  const selectedProjectValue = projectId ?? NO_PROJECT_VALUE;
  const selectedProjectTitle =
    selectedProjectValue !== NO_PROJECT_VALUE
      ? (projectOptions.find((p) => p._id === selectedProjectValue)?.title ??
        "Project")
      : "Project";

  return (
    <Select
      value={selectedProjectValue}
      onValueChange={(val) => {
        if (val === NEW_PROJECT_VALUE) {
          onCreateProject();
          return;
        }
        if (val === NO_PROJECT_VALUE) {
          updateTask({ id: taskId, projectId: null });
        } else {
          const project = projectOptions.find((p) => p._id === val);
          if (project) {
            updateTask({ id: taskId, projectId: project._id });
          }
        }
      }}
    >
      <SelectTrigger className={FIELD_TRIGGER_CLASS}>
        <SelectValue placeholder="Project">
          <div
            className={`flex items-center gap-1.5 ${selectedProjectValue === NO_PROJECT_VALUE ? "text-muted-foreground" : ""}`}
          >
            <IconFolder size={14} className="text-muted-foreground" />
            <span>{selectedProjectTitle}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Project</SelectLabel>
          <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
          {projectId && !hasSelectedProject && (
            <SelectItem value={projectId}>
              <div className="flex items-center gap-1.5">
                <IconFolder size={14} className="text-muted-foreground" />
                <span>Current project</span>
              </div>
            </SelectItem>
          )}
          {projectOptions.map((project) => (
            <SelectItem key={project._id} value={project._id}>
              <div className="flex items-center gap-1.5">
                <IconFolder size={14} className="text-muted-foreground" />
                <span>{project.title}</span>
              </div>
            </SelectItem>
          ))}
          <SelectItem value={NEW_PROJECT_VALUE}>
            <div className="flex items-center gap-1.5">
              <IconFolderPlus size={14} className="text-muted-foreground" />
              <span>New project...</span>
            </div>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
