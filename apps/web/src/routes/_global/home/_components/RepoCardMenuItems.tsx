import { ContextMenuItem, DropdownMenuItem } from "@vvedantb/ui";
import {
  IconEyeOff,
  IconFolders,
  IconPencil,
  IconPhoto,
  IconPhotoOff,
} from "@tabler/icons-react";

/**
 * The repo card's actions, hosted in either menu surface.
 *
 * Right-click is the only affordance a pointer device needs, but on touch there
 * is nothing to right-click, so the same items are re-hosted behind a kebab
 * below `sm`. Both surfaces render this one component so the two can never
 * drift apart — see `TaskCardMenuItems` for the original of this pattern.
 */
export interface RepoCardMenuItemsProps {
  variant: "context" | "dropdown";
  hasLogo: boolean;
  onRename: () => void;
  onManageApps: () => void;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
  onHide: () => void;
}

export function RepoCardMenuItems({
  variant,
  hasLogo,
  onRename,
  onManageApps,
  onPickLogo,
  onRemoveLogo,
  onHide,
}: RepoCardMenuItemsProps) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;

  return (
    <>
      <Item onClick={onRename}>
        <IconPencil size={16} />
        Rename
      </Item>
      <Item onClick={onManageApps}>
        <IconFolders size={16} />
        Manage apps
      </Item>
      <Item onClick={onPickLogo}>
        <IconPhoto size={16} />
        {hasLogo ? "Change logo" : "Set logo"}
      </Item>
      {hasLogo && (
        <Item onClick={onRemoveLogo}>
          <IconPhotoOff size={16} />
          Remove logo
        </Item>
      )}
      <Item onClick={onHide}>
        <IconEyeOff size={16} />
        Hide
      </Item>
    </>
  );
}
