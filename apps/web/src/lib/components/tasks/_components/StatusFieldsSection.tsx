"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api, normalizeAIModel } from "@eva/backend";
import type { Doc, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
  Input,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconUserPlus,
  IconFolder,
  IconFolderPlus,
  IconTags,
  IconGitBranch,
  IconInfoCircle,
  IconBrandVercelFilled,
  IconChevronDown,
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
  FieldsSection,
  FIELD_ROW_CLASS,
  FIELD_TRIGGER_CLASS,
} from "@/lib/components/fields/FieldsSection";
import {
  DEPLOYMENT_STATUS_CONFIG,
  getUserDisplayName,
  NO_PROJECT_VALUE,
  NEW_PROJECT_VALUE,
  NO_PRIORITY_VALUE,
  UNASSIGNED_VALUE,
  canEditTaskModel,
} from "./task-detail-constants";
import {
  useAvailableAiModels,
  useTaskOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { NewProjectModal } from "@/lib/components/projects/NewProjectModal";

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
  baseBranch: string;
  setBaseBranch: (v: string) => void;
  latestDeployment: RunDoc | undefined;
  hasActiveRun: boolean;
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
  setBaseBranch,
  latestDeployment,
  hasActiveRun: _hasActiveRun,
  hasRuns,
  isOwner,
  allTags,
}: StatusFieldsSectionProps) {
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
  const [tagDraft, setTagDraft] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const tagDraftRef = useRef<HTMLInputElement>(null);

  const addTag = async (raw: string) => {
    const value = raw.trim();
    if (!value || !task) return;
    const current = task.tags ?? [];
    if (current.includes(value)) return;
    await updateTask({ id: taskId, tags: [...current, value] });
  };

  const removeTag = async (tag: string) => {
    if (!task) return;
    const next = (task.tags ?? []).filter((t) => t !== tag);
    await updateTask({ id: taskId, tags: next });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && tagDraft.trim()) {
      e.preventDefault();
      void addTag(tagDraft);
      setTagDraft("");
    }
    if (
      e.key === "Backspace" &&
      tagDraft === "" &&
      (task?.tags?.length ?? 0) > 0
    ) {
      const tags = task?.tags ?? [];
      void removeTag(tags[tags.length - 1]);
    }
  };

  const projectOptions = projects ?? [];
  const hasSelectedProject =
    task?.projectId !== undefined &&
    projectOptions.some((project) => project._id === task.projectId);
  const selectedProjectValue = task?.projectId ?? NO_PROJECT_VALUE;
  const selectedProjectTitle =
    selectedProjectValue !== NO_PROJECT_VALUE
      ? (projectOptions.find((p) => p._id === selectedProjectValue)?.title ??
        "Project")
      : "Project";
  const assignedUser = task?.assignedTo
    ? users?.find((u) => u._id === task.assignedTo)
    : undefined;
  const assignedDisplayName = assignedUser
    ? getUserDisplayName(assignedUser)
    : "Unnamed User";
  const reviewers = (users ?? []).filter((u) => u.role === "dev");
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
              {status
                ? (() => {
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
                  })()
                : null}
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

        <Select
          value={task?.priority ?? NO_PRIORITY_VALUE}
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
                className={`flex items-center gap-1.5 ${task?.priority ? "" : "text-muted-foreground"}`}
              >
                <PriorityIcon level={task?.priority} size={14} />
                <span>
                  {task?.priority ? PRIORITY_LABELS[task.priority] : "Priority"}
                </span>
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

        <Select
          value={task?.assignedTo ?? UNASSIGNED_VALUE}
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
                className={`flex items-center gap-1.5 ${!task?.assignedTo ? "text-muted-foreground" : ""}`}
              >
                {assignedUser ? (
                  <UserInitials user={assignedUser} size="sm" hideLastSeen />
                ) : (
                  <IconUserPlus size={14} className="text-muted-foreground" />
                )}
                <span data-pii={Boolean(task?.assignedTo) || undefined}>
                  {task?.assignedTo ? assignedDisplayName : "Code Reviewer"}
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
                    <Facehash
                      size={16}
                      name={getUserInitials(user)}
                      enableBlink
                    />
                    <span data-pii>{getUserDisplayName(user)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

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
            className="px-0"
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

        {!task?.projectId && (
          <div className={FIELD_ROW_CLASS}>
            {status === "todo" ? (
              <BranchSelect
                value={baseBranch}
                onValueChange={(val) => {
                  setBaseBranch(val);
                  updateTask({ id: taskId, baseBranch: val });
                }}
                className="h-7 border-0 shadow-none bg-transparent px-0 hover:bg-transparent text-[13px] [&>svg:last-child]:hidden"
              />
            ) : (
              <div className="flex items-center gap-1.5 text-[13px]">
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
          </div>
        )}

        {latestDeployment?.deploymentStatus && (
          <div className={`${FIELD_ROW_CLASS} gap-1.5 text-[13px]`}>
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
          </div>
        )}
      </FieldsSection>

      <FieldsSection title="Labels">
        {/* No row-level `onClick` to focus the input: a click handler on a
            non-interactive element has no keyboard equivalent, and the input
            already fills the rest of the row, so it is directly clickable. */}
        <div
          className={`${FIELD_ROW_CLASS} group/tags flex-wrap gap-1 cursor-text`}
        >
          <IconTags size={14} className="text-muted-foreground shrink-0" />
          <AnimatePresence initial={false} mode="popLayout">
            {task?.tags?.map((tag) => (
              <m.span
                key={tag}
                className="inline-flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                <Badge
                  variant="outline"
                  className="text-xs h-8 gap-0.5 pr-0.5 group/tag sm:h-5"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove label ${tag}`}
                    className="ml-0.5 rounded-sm px-0.5 opacity-50 transition-opacity hover:opacity-100 max-sm:flex max-sm:h-full max-sm:min-w-6 max-sm:items-center max-sm:justify-center max-sm:px-1"
                    onClick={() => void removeTag(tag)}
                  >
                    ×
                  </button>
                </Badge>
              </m.span>
            ))}
          </AnimatePresence>
          <Input
            ref={tagDraftRef}
            value={tagDraft}
            placeholder={
              (task?.tags?.length ?? 0) === 0 ? "Tags" : "Add tag..."
            }
            className="h-7 border-0 shadow-none bg-transparent px-0 focus-visible:ring-0 text-[13px] min-w-16 flex-1 placeholder:text-muted-foreground"
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={() => {
              if (tagDraft.trim()) {
                void addTag(tagDraft);
                setTagDraft("");
              }
            }}
            onKeyDown={handleTagKeyDown}
          />
          {allTags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Choose from existing labels"
                  className="rounded-sm p-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground max-sm:flex max-sm:size-10 max-sm:items-center max-sm:justify-center max-sm:p-0"
                >
                  <IconChevronDown size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-56 overflow-y-auto"
              >
                {(() => {
                  const tagSet = new Set(task?.tags ?? []);
                  return allTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={tagSet.has(tag)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          void addTag(tag);
                        } else {
                          void removeTag(tag);
                        }
                      }}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ));
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </FieldsSection>

      <FieldsSection title="Project">
        <Select
          value={selectedProjectValue}
          onValueChange={(val) => {
            if (val === NEW_PROJECT_VALUE) {
              setIsCreatingProject(true);
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
              {task?.projectId && !hasSelectedProject && (
                <SelectItem value={task.projectId}>
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
