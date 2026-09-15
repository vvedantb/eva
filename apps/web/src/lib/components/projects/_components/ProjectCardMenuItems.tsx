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
} from "@eva/ui";
import type { api, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconGitBranch,
  IconPencil,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import {
  phaseConfig,
  PROJECT_PHASES,
  type ProjectPhase,
} from "@/lib/components/projects/ProjectPhaseBadge";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The project card's actions, hosted in either menu surface. Right-click covers
 * pointer devices; below `sm` a kebab re-hosts the same items, since touch has
 * nothing to right-click and the card carried no visible affordance at all.
 * Both surfaces render this one component so the two can never drift apart —
 * see `TaskCardMenuItems` for the original of this pattern.
 */
export interface ProjectCardMenuItemsProps {
  variant: "context" | "dropdown";
  title: string;
  phase: ProjectPhase;
  projectLead?: Id<"users">;
  currentUserId?: Id<"users">;
  users?: User[];
  href?: string;
  branchName?: string;
  repoFullName: string;
  onPhaseChange: (phase: ProjectPhase) => void;
  onLeadChange: (value: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectCardMenuItems({
  variant,
  title,
  phase,
  projectLead,
  currentUserId,
  users,
  href,
  branchName,
  repoFullName,
  onPhaseChange,
  onLeadChange,
  onEdit,
  onDelete,
}: ProjectCardMenuItemsProps) {
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

  const PhaseIcon = phaseConfig[phase].icon;

  return (
    <>
      <Sub>
        <SubTrigger>
          <PhaseIcon size={16} className={phaseConfig[phase].text} />
          Phase
        </SubTrigger>
        <SubContent>
          <RadioGroup
            value={phase}
            onValueChange={(value) => {
              const matched = PROJECT_PHASES.find((p) => p === value);
              if (!matched) return;
              onPhaseChange(matched);
            }}
          >
            {PROJECT_PHASES.map((p) => {
              const cfg = phaseConfig[p];
              const Icon = cfg.icon;
              return (
                <RadioItem key={p} value={p}>
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
          <IconUserPlus className="size-4" />
          Project Lead
        </SubTrigger>
        <SubContent>
          <RadioGroup
            value={projectLead ?? "none"}
            onValueChange={onLeadChange}
          >
            {currentUserId ? (
              <>
                <RadioItem value={currentUserId}>Set myself as lead</RadioItem>
                <MenuSeparator />
              </>
            ) : null}
            <RadioItem value="none">No lead</RadioItem>
            {(users ?? []).map((user) => (
              <RadioItem data-pii key={user._id} value={user._id}>
                {user.fullName ?? user.firstName ?? "Unknown"}
              </RadioItem>
            ))}
          </RadioGroup>
        </SubContent>
      </Sub>
      <MenuSeparator />
      {href ? (
        <Item
          onClick={() => {
            window.open(href, "_blank");
          }}
        >
          <IconExternalLink className="size-4" />
          Open in new tab
        </Item>
      ) : null}
      {branchName ? (
        <Item asChild>
          <a
            href={`https://github.com/${repoFullName}/tree/${branchName}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconGitBranch className="size-4" />
            View Branch
          </a>
        </Item>
      ) : null}
      <Item onClick={onEdit}>
        <IconPencil className="size-4" />
        Edit Details
      </Item>
      <MenuSeparator />
      <Item
        onClick={() => {
          void navigator.clipboard.writeText(title);
        }}
      >
        <IconClipboard className="size-4" />
        Copy title
      </Item>
      {branchName ? (
        <Item
          onClick={() => {
            void navigator.clipboard.writeText(branchName);
          }}
        >
          <IconCopy className="size-4" />
          Copy branch name
        </Item>
      ) : null}
      <MenuSeparator />
      <Item
        className="text-destructive"
        onClick={onDelete}
        title={skipConfirmTitle("Delete")}
      >
        <IconTrash className="size-4" />
        Delete
        <ConfirmSkipHint />
      </Item>
    </>
  );
}
