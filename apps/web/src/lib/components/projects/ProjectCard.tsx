"use client";

import type { Id } from "@eva/backend";
import { useState, type MouseEvent } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { UserInitials } from "@eva/shared/user-initials";
import { IconDots, IconListCheck, IconSparkles } from "@tabler/icons-react";
import {
  AvatarStack,
  Badge,
  cn,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  BorderBeam,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  LIST_ROW_CONTROL_CLASS,
  ListRow,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { type ProjectPhase } from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectCardMenuItems } from "./_components/ProjectCardMenuItems";
import {
  SANDBOX_STATUS_STYLES,
  type SandboxStatus,
} from "@/lib/components/sandbox/sandboxStatusStyles";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import { EntityNumLabel } from "@/lib/components/ui/EntityNumLabel";
import { ProjectProgressBar } from "./ProjectProgressBar";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";

interface ProjectCardProps {
  projectId: Id<"projects">;
  userId: Id<"users">;
  title: string;
  description?: string;
  rawInput?: string;
  branchName?: string;
  numId?: number;
  repoFullName: string;
  createdAt: number;
  accentColor: string;
  members?: Array<Id<"users">>;
  projectLead?: Id<"users">;
  phase: ProjectPhase;
  planningMode: "interview" | "tasks_only";
  isBuilding?: boolean;
  sandboxStatus?: SandboxStatus;
  isActive?: boolean;
  isSelecting?: boolean;
  isSelected?: boolean;
  /** `shiftKey` asks the owner for a range selection from its anchor. */
  onToggleSelect?: (event: { shiftKey: boolean }) => void;
  /** Public (slash) path; rendered via router Link so rewrites own the href. */
  href?: string;
  /**
   * Plain-click handler. Call `event.preventDefault()` to cancel Link
   * navigation (e.g. while a dialog is open).
   */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onDelete: () => void;
}

export function ProjectCard({
  projectId,
  userId,
  title,
  description,
  rawInput,
  branchName,
  numId,
  repoFullName,
  accentColor,
  members,
  projectLead,
  phase,
  planningMode,
  isBuilding = false,
  sandboxStatus,
  isActive,
  isSelecting,
  isSelected,
  onToggleSelect,
  href,
  onClick,
  onDelete,
}: ProjectCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editDescription, setEditDescription] = useState(description ?? "");
  const updateProject = useMutation(api.projects.update).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.projects.get, { id: projectId });
      if (current !== undefined && current !== null) {
        const {
          id: _id,
          priority,
          projectLead,
          codeReviewer,
          model,
          providerAccountId,
          ...safeFields
        } = args;
        localStore.setQuery(
          api.projects.get,
          { id: projectId },
          {
            ...current,
            ...safeFields,
            ...(priority !== undefined
              ? { priority: priority ?? undefined }
              : {}),
            ...(projectLead !== undefined
              ? { projectLead: projectLead ?? undefined }
              : {}),
            ...(codeReviewer !== undefined
              ? { codeReviewer: codeReviewer ?? undefined }
              : {}),
            ...(model !== undefined ? { model: model ?? undefined } : {}),
            ...(providerAccountId !== undefined
              ? { providerAccountId: providerAccountId ?? undefined }
              : {}),
          },
        );
      }
    },
  );
  const currentUserId = useQuery(api.auth.me);
  const users = useQuery(api.users.listAll);
  const memberIds = [
    ...new Set(
      [projectLead, ...(members ?? [])].filter(
        (id): id is Id<"users"> => id !== undefined,
      ),
    ),
  ];
  const previewText = description ?? rawInput;

  const MAX_AVATARS = 3;
  const allAvatarIds = memberIds.length > 0 ? memberIds : [userId];
  const shownAvatarIds = allAvatarIds.slice(0, MAX_AVATARS);
  const hiddenCount = allAvatarIds.length - MAX_AVATARS;

  const menuProps = {
    title,
    phase,
    projectLead,
    currentUserId,
    users,
    href,
    branchName,
    repoFullName,
    onPhaseChange: (nextPhase: ProjectPhase) => {
      void updateProject({ id: projectId, phase: nextPhase });
    },
    onLeadChange: (value: string) => {
      if (value === "none") {
        void updateProject({ id: projectId, projectLead: null });
        return;
      }
      const matchedUser = (users ?? []).find((u) => u._id === value);
      const leadId = currentUserId === value ? currentUserId : matchedUser?._id;
      if (!leadId) return;
      void updateProject({ id: projectId, projectLead: leadId });
    },
    onEdit: () => {
      setEditTitle(title);
      setEditDescription(description ?? "");
      setEditOpen(true);
    },
    onDelete,
  };

  const cardContent = (
    <ListRow
      className={cn("shrink-0", isSelected && "ring-2 ring-primary/40")}
      accentClassName={accentColor}
      selected={isActive}
      link={
        href ? (
          <DynamicLink to={toInternalRepoHref(href)} search={true} />
        ) : undefined
      }
      onClick={
        editOpen || isSelecting || onClick
          ? (event) => {
              if (editOpen) {
                event.preventDefault();
                return;
              }
              // While selecting, the whole card is a selection target — the
              // stretched link would otherwise navigate away mid-selection.
              if (isSelecting) {
                event.preventDefault();
                onToggleSelect?.({ shiftKey: event.shiftKey });
                return;
              }
              onClick?.(event);
            }
          : undefined
      }
      aria-label={title}
      contentClassName="flex flex-col gap-1.5 px-3 py-2.5 pl-3.5"
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
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <EntityNumLabel numId={numId} />
            <MarqueeOnHover className="min-w-0 flex-1 text-[13px] font-medium leading-5 tracking-[-0.01em] text-foreground transition-colors duration-[var(--motion-base)] group-hover:text-primary">
              {title}
            </MarqueeOnHover>
          </div>
          {previewText ? (
            <p
              className={cn(
                "mt-1 line-clamp-2 text-xs leading-relaxed text-pretty",
                description
                  ? "text-muted-foreground"
                  : "italic text-muted-foreground/80",
              )}
            >
              {previewText}
            </p>
          ) : null}
        </div>
        {sandboxStatus ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "relative mt-1.5 size-2 shrink-0 rounded-full hit-target",
                  SANDBOX_STATUS_STYLES[sandboxStatus].dot,
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              {SANDBOX_STATUS_STYLES[sandboxStatus].label}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="gap-0.5 px-1.5 py-0 text-[10px] font-medium leading-4"
            >
              {planningMode === "interview" ? (
                <IconSparkles className="size-2.5 shrink-0" />
              ) : (
                <IconListCheck className="size-2.5 shrink-0" />
              )}
              {planningMode === "interview" ? "Interview" : "Tasks only"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {planningMode === "interview"
              ? "Created with AI interview and generated plan"
              : "Created as a tasks-only container"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-0.5 pt-0.5">
        <ProjectProgressBar
          projectId={projectId}
          className="h-1 bg-secondary/80"
        />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <AvatarStack size={18} className="-space-x-0.5">
              {shownAvatarIds.map((id) => (
                <UserInitials key={id} userId={id} hideLastSeen />
              ))}
            </AvatarStack>
            {hiddenCount > 0 ? (
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                +{hiddenCount}
              </span>
            ) : null}
          </div>
          {/* Touch has no right-click, so below `sm` the same items get a
              visible kebab. `LIST_ROW_CONTROL_CLASS` lifts it above the row's
              stretched link overlay, which is at z-1. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Project actions"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "ml-auto max-sm:shrink-0",
                  CARD_KEBAB_CLASS,
                  LIST_ROW_CONTROL_CLASS,
                )}
              >
                <IconDots className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <ProjectCardMenuItems variant="dropdown" {...menuProps} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await updateProject({
                id: projectId,
                title: editTitle,
                description: editDescription || undefined,
              });
              setEditOpen(false);
            }}
            className="flex flex-col gap-4"
          >
            <Input
              placeholder="Title"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              rows={6}
              className="min-h-[160px] resize-y"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!editTitle.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ListRow>
  );

  const wrappedCard = isBuilding ? (
    <BorderBeam
      active
      colorVariant="progress"
      className="rounded-surface"
    >
      {cardContent}
    </BorderBeam>
  ) : (
    cardContent
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{wrappedCard}</ContextMenuTrigger>
      <ContextMenuContent onClick={(e) => e.stopPropagation()}>
        <ProjectCardMenuItems variant="context" {...menuProps} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
