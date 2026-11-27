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
  IconArchive,
  IconArchiveOff,
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconGitBranch,
  IconLink,
  IconPencil,
  IconUserPlus,
} from "@tabler/icons-react";
import { PrActionsSubmenus } from "@/lib/components/pr-menu/PrActionsSubmenus";
import { useOwnerPullRequests } from "@/lib/components/pr-menu/useOwnerPullRequests";

type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The project menu body, shared by the card's right-click menu, the card's
 * kebab (touch has nothing to right-click) and the project header "…" menu.
 * Groups: project properties, open and copy, PRs and plan, then Archive. An
 * archived project is read-only: no properties, and Unarchive for Archive.
 * See `TaskCardMenuItems` for the original of this pattern.
 */
export interface ProjectCardMenuItemsProps {
  variant: "context" | "dropdown";
  projectId: Id<"projects">;
  title: string;
  projectLead?: Id<"users">;
  currentUserId?: Id<"users">;
  users?: User[];  href?: string;  showOpenInNewTab?: boolean;
  branchName?: string;  leading?: ReactNode;
  onLeadChange: (value: string) => void;
  onEdit: () => void;  archived?: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
}

export function ProjectCardMenuItems({
  variant,
  projectId,
  title,
  projectLead,
  currentUserId,
  users,
  href,
  showOpenInNewTab = false,
  branchName,
  leading,
  onLeadChange,
  onEdit,
  archived = false,
  onArchive,
  onUnarchive,
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

  const hasPrGroup = prs.length > 0;

  return (
    <>
      {leading ? (
        <>
          {leading}
          <MenuSeparator />
        </>
      ) : null}
      {archived ? null : (
        <>
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
        </>
      )}
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
        </>
      ) : null}
      <MenuSeparator />
      {archived ? (
        <Item onSelect={onUnarchive}>
          <IconArchiveOff size={iconSize} />
          Unarchive
        </Item>
      ) : (
        <Item onSelect={onArchive} title={skipConfirmTitle("Archive")}>
          <IconArchive size={iconSize} />
          Archive
          <ConfirmSkipHint />
        </Item>
      )}
    </>
  );
}
