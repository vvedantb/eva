"use client";

import type { ReactNode } from "react";
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
  ConfirmSkipHint,
  skipConfirmTitle,
  toast,
} from "@vvedantb/ui";
import { type Id, api } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import type { FunctionReturnType } from "convex/server";
import {
  IconArrowMoveRight,
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconGitBranch,
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
import { catchMutationError } from "@/lib/utils/mutationToast";
import { PrActionsSubmenus } from "@/lib/components/pr-menu/PrActionsSubmenus";
import { useOwnerPullRequests } from "@/lib/components/pr-menu/useOwnerPullRequests";

export type GroupedCodebase = FunctionReturnType<
  typeof api.githubRepos.listGroupedByCodebase
>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];

export interface TaskCardMenuItemsProps {
  variant: "context" | "dropdown";
  id: Id<"agentTasks">;
  title: string;
  status: TaskStatus;
  /** The task page; Copy link copies it. */
  href?: string;
  /** Cards link elsewhere; the task header already is the task. */
  showOpenInNewTab?: boolean;
  /** Task header only: its sandbox and PR commands, above the shared items. */
  leading?: ReactNode;
  assignedTo?: Id<"users">;
  projectId?: Id<"projects">;
  repoId?: Id<"githubRepos">;
  groupedCodebases?: GroupedCodebase[];
  users?: User[];
  currentUserId?: Id<"users">;
  projects?: Project[];
  onDelete: () => void;
  onMove: (targetId: Id<"githubRepos">) => void;
}

/**
 * Quick task menu body shared by the card's right-click menu, the card's kebab
 * and the task header "…" menu. Groups: Run Eva, triage (Status, Code
 * Reviewer), open and copy, PRs, then Move and Delete. Model and project are
 * set on the task page, not here.
 */
export function TaskCardMenuItems({
  variant,
  id,
  title,
  status,
  href,
  showOpenInNewTab = false,
  leading,
  assignedTo,
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
    patchLoadedQuery(localStore, api.agentTasks.getAllTasks, { repoId }, (cur) =>
      cur.map((task) =>
        task._id === args.id ? { ...task, status: args.status } : task,
      ),
    );
  });
  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      if (!repoId) return;
      patchLoadedQuery(localStore, api.agentTasks.getAllTasks, { repoId }, (cur) =>
        cur.map((task) =>
          task._id === args.id && args.assignedTo !== undefined
            ? { ...task, assignedTo: args.assignedTo ?? undefined }
            : task,
        ),
      );
    },
  );
  const startExecution = useMutation(api.agentTasks.startExecution);

  // A card only needs runs and PRs once the menu is open — Radix mounts menu
  // content on demand, so these stay per opened menu rather than per card on
  // the board. PRs come primary first; a project task links its project's.
  const runs = useQuery(api.agentRuns.listByTask, { taskId: id });
  const taskPrs = useOwnerPullRequests({ kind: "task", taskId: id });
  // A project task without PRs of its own links its project's, which is a bare
  // URL here: the project's rows are not loaded on a task card.
  const projectPrUrl =
    taskPrs.length === 0
      ? projects?.find((project) => project._id === projectId)?.prUrl
      : undefined;
  // Tasks store no branch; the primary PR's head is the one Eva works on.
  const branchName = taskPrs[0]?.headBranch;

  // Mirrors `showRunButton` in `TaskFooter`: `todo` only offers a first run.
  const canRun =
    (status === "todo" && runs !== undefined && runs.length === 0) ||
    status === "in_progress";
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
  const iconSize = variant === "context" ? 16 : 14;

  // Filter out the current repo from move targets
  const moveTargets = groupedCodebases?.filter((codebase) =>
    codebase.apps.some((app) => app._id !== repoId),
  );
  const hasMoveTargets = moveTargets && moveTargets.length > 0;
  const hasPrGroup = taskPrs.length > 0 || projectPrUrl !== undefined;

  return (
    <>
      {leading ? (
        <>
          {leading}
          <MenuSeparator />
        </>
      ) : null}

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
            <IconPlayerPlay size={iconSize} />
            Run Eva
          </Item>
          <MenuSeparator />
        </>
      )}

      <Sub>
        <SubTrigger>
          <StatusIcon size={iconSize} />
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
                  <Icon size={iconSize} className={cfg.text} />
                  {cfg.label}
                </RadioItem>
              );
            })}
          </RadioGroup>
        </SubContent>
      </Sub>

      <Sub>
        <SubTrigger>
          <IconUserPlus size={iconSize} />
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

      <MenuSeparator />

      {showOpenInNewTab && href ? (
        <Item
          onSelect={() => {
            window.open(href, "_blank", "noopener,noreferrer");
          }}
        >
          <IconExternalLink size={iconSize} />
          Open in new tab
        </Item>
      ) : null}
      <Sub>
        <SubTrigger>
          <IconCopy size={iconSize} />
          Copy
        </SubTrigger>
        <SubContent>
          <Item
            onSelect={() => {
              void navigator.clipboard.writeText(title);
            }}
          >
            <IconClipboard size={iconSize} />
            Title
          </Item>
          {href ? (
            /*
             * A card sits in a list or on the board, so the current pathname
             * is that list — not the task. Copy the task's own href instead.
             */
            <Item
              onSelect={() => {
                void navigator.clipboard.writeText(
                  window.location.origin + href,
                );
              }}
            >
              <IconLink size={iconSize} />
              Link
            </Item>
          ) : null}
          {branchName ? (
            <Item
              onSelect={() => {
                void navigator.clipboard.writeText(branchName).then(() => {
                  toast.success("Branch name copied");
                });
              }}
            >
              <IconGitBranch size={iconSize} />
              Branch name
            </Item>
          ) : null}
        </SubContent>
      </Sub>

      {hasPrGroup ? (
        <>
          <MenuSeparator />
          <PrActionsSubmenus variant={variant} prs={taskPrs} />
          {projectPrUrl ? (
            <Item
              onSelect={() => {
                window.open(projectPrUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <IconGitPullRequest size={iconSize} />
              View PR
            </Item>
          ) : null}
        </>
      ) : null}

      <MenuSeparator />

      {hasMoveTargets && (
        <Sub>
          <SubTrigger>
            <IconArrowMoveRight size={iconSize} />
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
      )}
      <Item
        className="text-destructive focus:text-destructive"
        title={skipConfirmTitle("Delete")}
        onSelect={() => {
          onDelete();
        }}
      >
        <IconTrash size={iconSize} />
        Delete
        <ConfirmSkipHint />
      </Item>
    </>
  );
}
