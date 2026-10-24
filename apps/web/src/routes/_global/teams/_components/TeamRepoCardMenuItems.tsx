import { ContextMenuItem, DropdownMenuItem } from "@vvedantb/ui";
import {
  IconPencil,
  IconPhoto,
  IconPhotoOff,
  IconTrash,
} from "@tabler/icons-react";

/**
 * The team repo row's actions, hosted in either menu surface. On a pointer
 * device the row also shows its owner actions as inline icon buttons; below
 * `sm` those collapse into the kebab this feeds, so a phone gets one affordance
 * instead of four cramped ones.
 */
export interface TeamRepoCardMenuItemsProps {
  variant: "context" | "dropdown";
  isOwner: boolean;
  hasLogo: boolean;
  onRename: () => void;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
  onRemove: () => void;
}

export function TeamRepoCardMenuItems({
  variant,
  isOwner,
  hasLogo,
  onRename,
  onPickLogo,
  onRemoveLogo,
  onRemove,
}: TeamRepoCardMenuItemsProps) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;

  return (
    <>
      <Item onClick={onRename}>
        <IconPencil size={16} />
        Rename
      </Item>
      {isOwner ? (
        <Item onClick={onPickLogo}>
          <IconPhoto size={16} />
          {hasLogo ? "Change logo" : "Set logo"}
        </Item>
      ) : null}
      {isOwner && hasLogo ? (
        <Item onClick={onRemoveLogo}>
          <IconPhotoOff size={16} />
          Remove logo
        </Item>
      ) : null}
      {isOwner ? (
        <Item onClick={onRemove}>
          <IconTrash size={16} />
          Remove from team
        </Item>
      ) : null}
    </>
  );
}
