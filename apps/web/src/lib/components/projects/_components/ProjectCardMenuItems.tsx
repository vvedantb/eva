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
  ConfirmSkipHint,
  skipConfirmTitle,
  toast,
} from "@vvedantb/ui";
import type { api, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconGitBranch,
  IconLink,
  IconPencil,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import {
  phaseConfig,
  PROJECT_PHASES,
  type ProjectPhase,
} from "@/lib/components/projects/ProjectPhaseBadge";
import { PrActionsSubmenus } from "@/lib/components/pr-menu/PrActionsSubmenus";
import { useOwnerPullRequests } from "@/lib/components/pr-menu/useOwnerPullRequests";

type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The project menu body, shared by the card's right-click menu, the card's
 * kebab (touch has nothing to right-click) and the project header "…" menu.
 * Groups: project properties, open and copy, PRs and plan, then Delete.
 * See `TaskCardMenuItems` for the original of this pattern.
 */
export interface ProjectCardMenuItemsProps {
  variant: "context" | "dropdown";
  projectId: Id<"projects">;
  title: string;
  phase: ProjectPhase;
  projectLead?: Id<"users">;
  currentUserId?: Id<"users">;
  users?: User[];
  /** The project page; Copy link copies it. */
  href?: string;
  /** Cards link elsewhere; the project header already is the project. */
  showOpenInNewTab?: boolean;
  branchName?: string;
  /** Project header only: its sandbox and PR commands, above the shared items. */
  leading?: ReactNode;
  /** Project header only: View Plan and View Interview History, after the PRs. */
  planItems?: ReactNode;
  onPhaseChange: (phase: ProjectPhase) => void;
  onLeadChange: (value: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectCardMenuItems({
  variant,
  projectId,
  title,
  phase,
  projectLead,
  currentUserId,
  users,
  href,
  showOpenInNewTab = false,
  branchName,
  leading,
  planItems,
  onPhaseChange,
  onLeadChange,
  onEdit,
  onDelete,
}: ProjectCardMenuItemsProps) {
  const prs = useOwnerPullRequests({ kind: "project", projectId });
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
  const iconSize = variant === "context" ? 16 : 14;

  const PhaseIcon = phaseConfig[phase].icon;
  const hasPrGroup = prs.length > 0 || planItems !== undefined;

  return (
    <>
      {leading ? (
        <>
          {leading}
          <MenuSeparator />
        </>
      ) : null}
      <Sub>
        <SubTrigger>
          <PhaseIcon size={iconSize} className={phaseConfig[phase].text} />
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
      <Item onSelect={onEdit}>
        <IconPencil size={iconSize} />
        Edit details
      </Item>
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
          <PrActionsSubmenus variant={variant} prs={prs} />
          {planItems}
        </>
      ) : null}
      <MenuSeparator />
      <Item
        className="text-destructive focus:text-destructive"
        onSelect={onDelete}
        title={skipConfirmTitle("Delete")}
      >
        <IconTrash size={iconSize} />
        Delete
        <ConfirmSkipHint />
      </Item>
    </>
  );
}
