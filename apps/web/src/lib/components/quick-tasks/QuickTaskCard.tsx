"use client";

import {
  Badge,
  BorderBeam,
  Checkbox,
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  LIST_ROW_CONTROL_CLASS,
  ListRow,
  LoadingState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@eva/ui";
import type { Id, api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { UserInitials } from "@eva/shared/user-initials";
import {
  SANDBOX_STATUS_STYLES,
  type SandboxStatus,
} from "@/lib/components/sandbox/sandboxStatusStyles";
import { IconClock, IconDots, IconFolder, IconTag } from "@tabler/icons-react";
import {
  statusConfig,
  type TaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import { PriorityIcon } from "@/lib/components/priority/PriorityIcon";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import {
  PRIORITY_LABELS,
  type Priority,
} from "@/lib/components/priority/priorityMeta";
import dayjs, { compactRelativeTime } from "@eva/shared/dates";
import { useState, type MouseEvent } from "react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import {
  DeleteTaskDialog,
  useDeleteAgentTask,
} from "./_components/DeleteTaskDialog";
import {
  MoveTaskDialog,
  useMoveAgentTask,
} from "./_components/MoveTaskDialog";
import { requestConfirm, useAltHeld } from "@/lib/confirm";
import { TaskCardMenuItems } from "./_components/TaskCardMenuItems";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";

type GroupedCodebase = FunctionReturnType<
  typeof api.githubRepos.listGroupedByCodebase
>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];

type DeploymentStatus = "queued" | "building" | "deployed" | "error";

interface QuickTaskCardProps {
  id: Id<"agentTasks">;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: Priority;
  numId?: number;
  projectNumId?: number;
  scheduledAt?: number;
  tags?: string[];
  createdByUser?: User;
  createdAt: number;
  projectName?: string;
  hasError?: boolean;
  deploymentStatus?: DeploymentStatus;
  sandboxStatus?: SandboxStatus;
  groupedCodebases?: GroupedCodebase[];
  /**
   * In-app path for the stretched ListRow link. Plain clicks navigate via the
   * router; call `event.preventDefault()` from onClick to cancel (selection).
   */
  href?: string;
  /**
   * Plain-click handler. Call `event.preventDefault()` to cancel Link
   * navigation (selection mode, open dialogs).
   */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  isSelecting?: boolean;
  isSelected?: boolean;
  isActive?: boolean;
  /** `shiftKey` asks the owner for a range selection from its anchor. */
  onToggleSelect?: (event: { shiftKey: boolean }) => void;
  assignedTo?: Id<"users">;
  model?: string;
  providerAccountId?: Id<"userProviderAccounts">;
  projectId?: Id<"projects">;
  repoId?: Id<"githubRepos">;
  users?: User[];
  currentUserId?: Id<"users">;
  projects?: Project[];
  /**
   * Live chat or main-run workflow. Drives the pixel mark only — kanban column
   * and status badge stay on `status`.
   */
  isAgentActive?: boolean;
}

export function QuickTaskCard({
  id,
  title,
  status,
  priority,
  numId,
  projectNumId,
  scheduledAt,
  tags,
  createdByUser,
  createdAt,
  projectName,
  hasError = false,
  deploymentStatus: _deploymentStatus,
  sandboxStatus,
  groupedCodebases,
  href,
  onClick,
  isSelecting,
  isSelected,
  isActive,
  onToggleSelect,
  assignedTo,
  model,
  providerAccountId,
  projectId,
  repoId,
  users,
  currentUserId,
  projects,
  isAgentActive = false,
}: QuickTaskCardProps) {
  const showError = hasError && status !== "done";
  const statusMeta = statusConfig[status];
  const accentClass = showError ? "bg-destructive" : statusMeta.bar;
  // Two different signals, two different marks: the beam is the column the task
  // sits in, so it stays on `status` alone — it used to switch on for any live
  // workflow, which read as a permanent spinner on cards nobody was working on.
  // A live turn gets the same pixel grid the session rows use instead.
  const isInProgress = !hasError && status === "in_progress";
  const showAgentPulse = !hasError && !isInProgress && isAgentActive;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Id<"githubRepos"> | null>(null);
  const altHeld = useAltHeld();
  const deleteTask = useDeleteAgentTask();
  const moveTask = useMoveAgentTask();

  // Find the app name for the move target across all codebases
  const moveTargetAppName = (() => {
    if (!moveTarget || !groupedCodebases) return "";
    for (const codebase of groupedCodebases) {
      const app = codebase.apps.find((a) => a._id === moveTarget);
      if (app) {
        // For monorepos, show "codebase/app", for single repos just the name
        return codebase.isMonorepo
          ? `${codebase.displayName}/${app.appName}`
          : codebase.displayName;
      }
    }
    return "";
  })();

  const menuProps = {
    id,
    title,
    status,
    href,
    assignedTo,
    model,
    providerAccountId,
    createdBy: createdByUser?._id,
    projectId,
    repoId,
    groupedCodebases,
    users,
    currentUserId,
    projects,
    onDelete: () =>
      requestConfirm(altHeld, () => setShowDeleteConfirm(true), () => {
        void deleteTask({ id }).catch((err) => {
          console.error("Failed to delete task:", err);
          toast.error("Could not delete the task. Try again.");
        });
      }),
    onMove: (targetId: Id<"githubRepos">) =>
      requestConfirm(altHeld, () => setMoveTarget(targetId), () => {
        void moveTask({ id, repoId: targetId }).catch((err) => {
          console.error("Failed to move task:", err);
          toast.error("Could not move the task. Try again.");
        });
      }),
  };

  const hasDialogOpen = showDeleteConfirm || moveTarget !== null;

  const hasMetadata =
    projectName !== undefined || (tags !== undefined && tags.length > 0);

  const creatorFirstName =
    createdByUser?.firstName ?? createdByUser?.fullName?.split(/\s+/)[0];

  const card = (
    <ListRow
      accentClassName={accentClass}
      selected={isActive}
      link={
        href ? (
          <DynamicLink to={toInternalRepoHref(href)} search={true} />
        ) : undefined
      }
      onClick={
        hasDialogOpen || onClick
          ? (event) => {
              if (hasDialogOpen) {
                event.preventDefault();
                return;
              }
              onClick?.(event);
            }
          : undefined
      }
      aria-label={title}
      contentClassName="flex flex-col gap-1.5 px-2.5 py-2 pl-3 sm:px-3 sm:py-2.5 sm:pl-3.5"
      className={cn(
        showError
          ? "border border-destructive/30 bg-destructive/5"
          : isInProgress
            ? "bg-card"
            : undefined,
        isSelected && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {isSelecting ? (
          <Checkbox
            checked={isSelected}
            // One handler, not `onClick` + `onCheckedChange`: Radix composes
            // its own toggle after ours and skips it once the event is
            // default-prevented, so this reads the shift modifier without
            // toggling twice.
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onToggleSelect?.({ shiftKey: event.shiftKey });
            }}
            className={cn("mt-0.5 shrink-0", LIST_ROW_CONTROL_CLASS)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <EntityNumLabel numId={numId} projectNumId={projectNumId} />
          <MarqueeOnHover className="min-w-0 flex-1 text-[13px] font-medium leading-5 tracking-[-0.01em] text-foreground transition-colors duration-[var(--motion-base)] group-hover:text-primary">
            {title}
          </MarqueeOnHover>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {priority ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="relative flex items-center hit-target">
                  <PriorityIcon level={priority} size={14} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{PRIORITY_LABELS[priority]}</TooltipContent>
            </Tooltip>
          ) : null}
          {sandboxStatus ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "relative size-2 shrink-0 rounded-full hit-target",
                    SANDBOX_STATUS_STYLES[sandboxStatus].dot,
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                {SANDBOX_STATUS_STYLES[sandboxStatus].label}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {scheduledAt ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="relative flex items-center text-primary hit-target">
                  <IconClock className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {status === "todo"
                  ? `Scheduled for ${dayjs(scheduledAt).format("MMM D, h:mm A")}`
                  : `Was scheduled for ${dayjs(scheduledAt).format("MMM D, h:mm A")}`}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {showAgentPulse ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="relative flex items-center hit-target">
                  <LoadingState
                    label="Working"
                    variant="Drive"
                    size="sm"
                    iconOnly
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>Eva is replying</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {hasMetadata ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {projectName ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="default"
                  className="max-w-full px-1.5 py-0 text-[10px] font-medium leading-4"
                >
                  <span className="flex min-w-0 items-center gap-0.5">
                    <IconFolder className="size-2.5 shrink-0" />
                    <span className="truncate">{projectName}</span>
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{projectName}</TooltipContent>
            </Tooltip>
          ) : null}
          {tags?.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="max-w-28 px-1.5 py-0 text-[10px] font-medium leading-4"
            >
              <span className="flex min-w-0 items-center gap-0.5">
                <IconTag className="size-2.5 shrink-0" />
                <span className="truncate">{tag}</span>
              </span>
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-0.5 flex items-center justify-between gap-2 pt-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {createdByUser ? (
            <>
              <UserInitials user={createdByUser} size="sm" />
              {creatorFirstName ? (
                <MarqueeOnHover className="min-w-0 text-[11px] text-muted-foreground/75">
                  <span data-pii>{creatorFirstName}</span>
                </MarqueeOnHover>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] tabular-nums text-muted-foreground/70">
            {compactRelativeTime(createdAt)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(CARD_KEBAB_CLASS, LIST_ROW_CONTROL_CLASS)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Task actions"
              >
                <IconDots className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <TaskCardMenuItems variant="dropdown" {...menuProps} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </ListRow>
  );

  const wrappedCard = isInProgress ? (
    <BorderBeam
      active
      colorVariant="progress"
      className="rounded-surface"
    >
      {card}
    </BorderBeam>
  ) : (
    card
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{wrappedCard}</ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <TaskCardMenuItems variant="context" {...menuProps} />
        </ContextMenuContent>
      </ContextMenu>

      <DeleteTaskDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        taskId={id}
        taskTitle={title}
      />

      <MoveTaskDialog
        targetId={moveTarget}
        targetAppName={moveTargetAppName}
        onClose={() => setMoveTarget(null)}
        taskId={id}
        taskTitle={title}
      />
    </>
  );
}
