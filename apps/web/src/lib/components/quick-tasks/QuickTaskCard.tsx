"use client";

import { cn } from "@eva/ui";
import {
  Badge,
  BorderBeam,
  Checkbox,
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
  MarqueeOnHover,
  UnreadDot,
} from "@vvedantb/ui";
import { api, type Id } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { UserInitials } from "@eva/shared/user-initials";
import {
  SANDBOX_STATUS_STYLES,
  showsSandboxStatusDot,
  type SandboxStatus,
} from "@/lib/components/sandbox/sandboxStatusStyles";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  IconClock,
  IconDots,
  IconPencil,
  IconTag,
} from "@tabler/icons-react";
import {
  statusConfig,
  type TaskStatus,
} from "@/lib/components/tasks/TaskStatusBadge";
import { PriorityIcon } from "@/lib/components/priority/PriorityIcon";
import { AwaitingAnswerMark } from "@/lib/components/ui/AwaitingAnswerMark";
import {
  PRIORITY_LABELS,
  type Priority,
} from "@/lib/components/priority/priorityMeta";
import dayjs, { compactRelativeTime } from "@eva/shared/dates";
import type { MouseEvent } from "react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { useTaskMenu } from "./_components/useTaskMenu";
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
  scheduledAt?: number;
  tags?: string[];
  createdByUser?: User;
  createdAt: number;
  hasError?: boolean;
  deploymentStatus?: DeploymentStatus;
  sandboxStatus?: SandboxStatus;
  groupedCodebases?: GroupedCodebase[];  href?: string;  onClick?: (event: MouseEvent<HTMLElement>) => void;
  isSelecting?: boolean;
  isSelected?: boolean;
  isActive?: boolean;  onToggleSelect?: (event: { shiftKey: boolean }) => void;
  assignedTo?: Id<"users">;
  projectId?: Id<"projects">;
  repoId?: Id<"githubRepos">;
  users?: User[];
  currentUserId?: Id<"users">;
  projects?: Project[];  isAgentActive?: boolean;  hasUnread?: boolean;  isAwaitingAnswer?: boolean;  archived?: boolean;
}

export function QuickTaskCard({
  id,
  title,
  status,
  priority,
  numId,
  scheduledAt,
  tags,
  createdByUser,
  createdAt,
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
  projectId,
  repoId,
  users,
  currentUserId,
  projects,
  isAgentActive = false,
  hasUnread = false,
  isAwaitingAnswer = false,
  archived = false,
}: QuickTaskCardProps) {
  const showError = hasError && status !== "done";
  const statusMeta = statusConfig[status];
  const accentClass = showError ? "bg-destructive" : statusMeta.bar;  const isInProgress = !hasError && status === "in_progress";
  const showAgentPulse = !hasError && !isInProgress && isAgentActive;
  const simpleView = useSimpleView();

  const { menuProps, dialogs, hasDialogOpen } = useTaskMenu({
    id,
    title,
    status,
    href,
    showOpenInNewTab: true,
    assignedTo,
    projectId,
    repoId,
    groupedCodebases,
    users,
    currentUserId,
    projects,
    archived,
  });
  const draftMarks = useQuery(
    api.drafts.listMarks,
    repoId ? { repoId } : "skip",
  );
  const hasDraftComment = draftMarks?.taskIds.includes(id) ?? false;

  const hasMetadata =
    (tags !== undefined && tags.length > 0) ||
    hasDraftComment;

  const creatorFirstName =
    createdByUser?.firstName ?? createdByUser?.fullName?.split(/\s+/)[0];

  const ageAndMenu = (
    <>
      <span className="text-2xs tabular-nums text-muted-foreground/70">
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
    </>
  );

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
            checked={isSelected}            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onToggleSelect?.({ shiftKey: event.shiftKey });
            }}
            className={cn("mt-0.5 shrink-0", LIST_ROW_CONTROL_CLASS)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <EntityNumLabel numId={numId} />
          <MarqueeOnHover className="min-w-0 flex-1 text-2sm font-medium leading-5 tracking-[-0.01em] text-foreground transition-colors duration-[var(--motion-base)] group-hover:text-primary">
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
          ) : null}          {isAwaitingAnswer ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="relative flex items-center hit-target">
                  <AwaitingAnswerMark />
                </span>
              </TooltipTrigger>
              <TooltipContent>Eva asked you a question</TooltipContent>
            </Tooltip>
          ) : showAgentPulse ? (
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
          ) : sandboxStatus &&
            showsSandboxStatusDot(sandboxStatus, simpleView) ? (
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
          ) : null}          <UnreadDot show={hasUnread && !isAgentActive} />
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
        </div>
      </div>

      {hasMetadata ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {tags?.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="max-w-28 px-1.5 py-0 text-3xs font-medium leading-4"
            >
              <span className="flex min-w-0 items-center gap-0.5">
                <IconTag className="size-2.5 shrink-0" />
                <span className="truncate">{tag}</span>
              </span>
            </Badge>
          ))}
          {hasDraftComment ? (
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-3xs font-medium leading-4"
            >
              <span className="flex min-w-0 items-center gap-0.5">
                <IconPencil className="size-2.5 shrink-0" />
                Draft comment
              </span>
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="mt-0.5 flex items-center justify-between gap-2 pt-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {createdByUser ? (
            <>
              <UserInitials user={createdByUser} size="sm" />
              {creatorFirstName ? (
                <MarqueeOnHover className="min-w-0 text-2xs text-muted-foreground/75">
                  <span data-pii>{creatorFirstName}</span>
                </MarqueeOnHover>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {ageAndMenu}
        </div>
      </div>
    </ListRow>
  );

  const wrappedCard = isInProgress ? (
    <BorderBeam active colorVariant="progress" className="rounded-surface">
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

      {dialogs}
    </>
  );
}
