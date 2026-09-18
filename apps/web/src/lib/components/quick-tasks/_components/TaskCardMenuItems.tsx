"use client";

import {
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  ContextMenuLabel,
  DropdownMenuLabel,
  ModelPickerContent,
  modelPickerSurfaceClass,
} from "@eva/ui";
import { normalizeAIModel, type Id, api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  IconArrowMoveRight,
  IconBrain,
  IconClipboard,
  IconExternalLink,
  IconFolder,
  IconGitPullRequest,
  IconLink,
  IconPlayerPlay,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  statusConfig,
  TASK_STATUSES,
  type TaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import { canEditTaskModel } from "@/lib/components/tasks/_components/task-detail-constants";
import { catchMutationError } from "@/lib/utils/mutationToast";
import {
  useAvailableAiModels,
  useTaskOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

type GroupedCodebase = FunctionReturnType<
  typeof api.githubRepos.listGroupedByCodebase
>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];

export interface TaskCardMenuItemsProps {
  variant: "context" | "dropdown";
  id: Id<"agentTasks">;
  title: string;
  status: TaskStatus;
  href?: string;
  assignedTo?: Id<"users">;
  model?: string;
  providerAccountId?: Id<"userProviderAccounts">;
  createdBy?: Id<"users">;
  projectId?: Id<"projects">;
  repoId?: Id<"githubRepos">;
  groupedCodebases?: GroupedCodebase[];
  users?: User[];
  currentUserId?: Id<"users">;
  projects?: Project[];
  onDelete: () => void;
  onMove: (targetId: Id<"githubRepos">) => void;
}

export function TaskCardMenuItems({
  variant,
  id,
  title,
  status,
  href,
  assignedTo,
  model,
  providerAccountId,
  createdBy,
  projectId,
  repoId,
  groupedCodebases,
  users,
  currentUserId,
  projects,
  onDelete,
  onMove,
}: TaskCardMenuItemsProps) {
  const updateStatus = useMutation(
    api.agentTasks.updateStatus,
  ).withOptimisticUpdate((localStore, args) => {
    if (!repoId) return;
    const current = localStore.getQuery(api.agentTasks.getAllTasks, { repoId });
    if (current !== undefined) {
      localStore.setQuery(
        api.agentTasks.getAllTasks,
        { repoId },
        current.map((task) =>
          task._id === args.id ? { ...task, status: args.status } : task,
        ),
      );
    }
  });
  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      if (!repoId) return;
      const current = localStore.getQuery(api.agentTasks.getAllTasks, {
        repoId,
      });
      if (current !== undefined) {
        localStore.setQuery(
          api.agentTasks.getAllTasks,
          { repoId },
          current.map((task) => {
            if (task._id !== args.id) return task;
            const updated = { ...task };
            if (args.tags !== undefined) updated.tags = args.tags;
            if (args.assignedTo !== undefined)
              updated.assignedTo = args.assignedTo ?? undefined;
            if (args.model !== undefined) updated.model = args.model;
            if (args.providerAccountId !== undefined)
              updated.providerAccountId = args.providerAccountId ?? undefined;
            if (args.projectId !== undefined)
              updated.projectId = args.projectId ?? undefined;
            return updated;
          }),
        );
      }
    },
  );
  const startExecution = useMutation(api.agentTasks.startExecution);
  const normalizedModel = normalizeAIModel(model);
  const { options: modelOptions } = useAvailableAiModels(
    repoId,
    normalizedModel,
  );
  const { options: accounts, resolveId: resolveAccountId } =
    useTaskOwnerProviderAccounts(id);

  // The PR lives on the task's runs, not the task, and a card only needs it
  // once the menu is open — Radix mounts menu content on demand, so this stays
  // one query per opened menu rather than one per card on the board.
  const runs = useQuery(api.agentRuns.listByTask, { taskId: id });
  const latestPrUrl = runs?.find((run) => run.prUrl)?.prUrl;

  const isOwner =
    currentUserId !== undefined &&
    createdBy !== undefined &&
    currentUserId === createdBy;

  const canRun = status === "todo" || status === "in_progress";
  const StatusIcon = statusConfig[status].icon;

  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const RadioGroup =
    variant === "context" ? ContextMenuRadioGroup : DropdownMenuRadioGroup;
  const RadioItem =
    variant === "context" ? ContextMenuRadioItem : DropdownMenuRadioItem;
  const MenuSeparator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const MenuLabel =
    variant === "context" ? ContextMenuLabel : DropdownMenuLabel;

  // Filter out the current repo from move targets
  const moveTargets = groupedCodebases?.filter((codebase) =>
    codebase.apps.some((app) => app._id !== repoId),
  );
  const hasMoveTargets = moveTargets && moveTargets.length > 0;

  return (
    <>
      {!projectId && (
        <>
          <Item
            disabled={!canRun}
            onSelect={() => {
              void catchMutationError(
                startExecution({ id }),
                "Couldn't start task",
                "task-run",
              );
            }}
          >
            <IconPlayerPlay size={16} />
            Run Eva
          </Item>
          <MenuSeparator />
        </>
      )}

      {href || latestPrUrl ? (
        <>
          {href ? (
            <Item
              onSelect={() => {
                window.open(href, "_blank");
              }}
            >
              <IconExternalLink size={16} />
              Open in new tab
            </Item>
          ) : null}
          {latestPrUrl ? (
            <Item
              onSelect={() => {
                window.open(latestPrUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <IconGitPullRequest size={16} />
              View PR
            </Item>
          ) : null}
          <MenuSeparator />
        </>
      ) : null}

      <Sub>
        <SubTrigger>
          <StatusIcon size={16} />
          Status
        </SubTrigger>
        <SubContent>
          <RadioGroup
            value={status}
            onValueChange={(value) => {
              const matched = TASK_STATUSES.find((s) => s === value);
              if (!matched) return;
              updateStatus({ id, status: matched });
            }}
          >
            {TASK_STATUSES.map((s) => {
              const cfg = statusConfig[s];
              const Icon = cfg.icon;
              return (
                <RadioItem key={s} value={s}>
                  <Icon size={16} className={cfg.text} />
                  {cfg.label}
                </RadioItem>
              );
            })}
          </RadioGroup>
        </SubContent>
      </Sub>

      <Sub>
        <SubTrigger>
          <IconUserPlus size={16} />
          Code Reviewer
        </SubTrigger>
        <SubContent>
          <RadioGroup
            value={assignedTo ?? "unassigned"}
            onValueChange={(value) => {
              if (value === "unassigned") {
                updateTask({ id, assignedTo: null });
              } else {
                const matchedUser = (users ?? []).find((u) => u._id === value);
                const userId =
                  currentUserId === value ? currentUserId : matchedUser?._id;
                if (!userId) return;
                updateTask({ id, assignedTo: userId });
              }
            }}
          >
            {currentUserId && (
              <RadioItem value={currentUserId}>Assign to me</RadioItem>
            )}
            <MenuSeparator />
            <RadioItem value="unassigned">Unassigned</RadioItem>
            {(users ?? []).flatMap((user) =>
              user.role === "dev"
                ? [
                    <RadioItem key={user._id} value={user._id}>
                      <span data-pii>
                        {user.fullName ?? user.firstName ?? "Unknown"}
                      </span>
                    </RadioItem>,
                  ]
                : [],
            )}
          </RadioGroup>
        </SubContent>
      </Sub>

      <Sub>
        <SubTrigger disabled={!canEditTaskModel(status)}>
          <IconBrain size={16} />
          Model
        </SubTrigger>
        <SubContent className={modelPickerSurfaceClass}>
          {/* Same body as QuickTaskModal / ModelSelect — do not hand-roll radios. */}
          <ModelPickerContent
            value={normalizedModel}
            accountId={providerAccountId ?? null}
            options={modelOptions}
            accounts={accounts}
            canSelectTeamWhilePersonal={isOwner}
            onSelect={(nextModel, nextAccountId) => {
              if (!isOwner) {
                updateTask({ id, model: nextModel });
                return;
              }
              updateTask({
                id,
                model: nextModel,
                providerAccountId: resolveAccountId(nextAccountId) ?? null,
              });
            }}
          />
        </SubContent>
      </Sub>

      <Sub>
        <SubTrigger>
          <IconFolder size={16} />
          Project
        </SubTrigger>
        <SubContent>
          <RadioGroup
            value={projectId ?? "none"}
            onValueChange={(value) => {
              if (value === "none") {
                updateTask({ id, projectId: null });
              } else {
                const matched = (projects ?? []).find((p) => p._id === value);
                if (!matched) return;
                updateTask({ id, projectId: matched._id });
              }
            }}
          >
            <RadioItem value="none">No project</RadioItem>
            {projects?.map((project) => (
              <RadioItem key={project._id} value={project._id}>
                {project.title}
              </RadioItem>
            ))}
          </RadioGroup>
        </SubContent>
      </Sub>

      <MenuSeparator />

      {hasMoveTargets && (
        <>
          <Sub>
            <SubTrigger>
              <IconArrowMoveRight size={16} />
              Move to codebase
            </SubTrigger>
            <SubContent className="max-h-80 overflow-y-auto">
              {moveTargets.map((codebase) => {
                // Filter out current repo from apps
                const availableApps = codebase.apps.filter(
                  (app) => app._id !== repoId,
                );
                if (availableApps.length === 0) return null;

                // Single app codebase: show directly
                if (!codebase.isMonorepo || availableApps.length === 1) {
                  const app = availableApps[0];
                  return (
                    <Item
                      key={app._id}
                      title={skipConfirmTitle("Move")}
                      onSelect={() => {
                        onMove(app._id);
                      }}
                    >
                      {codebase.displayName}
                      <ConfirmSkipHint />
                    </Item>
                  );
                }

                // Monorepo: show as submenu with apps grouped
                return (
                  <Sub key={codebase.codebase}>
                    <SubTrigger>{codebase.displayName}</SubTrigger>
                    <SubContent>
                      <MenuLabel className="text-xs text-muted-foreground">
                        Apps
                      </MenuLabel>
                      {availableApps.map((app) => (
                        <Item
                          key={app._id}
                          title={skipConfirmTitle("Move")}
                          onSelect={(e) => {
                            e.preventDefault();
                            onMove(app._id);
                          }}
                        >
                          {app.appName}
                          <ConfirmSkipHint />
                        </Item>
                      ))}
                    </SubContent>
                  </Sub>
                );
              })}
            </SubContent>
          </Sub>
          <MenuSeparator />
        </>
      )}

      <Item
        onSelect={() => {
          navigator.clipboard.writeText(title);
        }}
      >
        <IconClipboard size={16} />
        Copy title
      </Item>
      {href ? (
        /*
         * The card hosting this menu sits in a list or on the board, so the
         * current pathname is that list — not the task. Copy the card's own
         * href (already the public display-form path) instead.
         */
        <Item
          onSelect={() => {
            void navigator.clipboard.writeText(window.location.origin + href);
          }}
        >
          <IconLink size={16} />
          Copy task link
        </Item>
      ) : null}

      <MenuSeparator />

      <Item
        className="text-destructive focus:text-destructive"
        title={skipConfirmTitle("Delete")}
        onSelect={() => {
          onDelete();
        }}
      >
        <IconTrash size={16} />
        Delete
        <ConfirmSkipHint />
      </Item>
    </>
  );
}
