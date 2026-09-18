import {
  ContextMenuItem,
  ContextMenuSeparator,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@eva/ui";
import { IconPhoto, IconPhotoOff, IconTrash } from "@tabler/icons-react";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

/**
 * The team card's actions, hosted in either menu surface. Right-click covers
 * pointer devices; below `sm` a kebab re-hosts the same items, since touch has
 * nothing to right-click and the card carried no visible affordance at all.
 */
export interface TeamCardMenuItemsProps {
  variant: "context" | "dropdown";
  hasLogo: boolean;
  canDelete: boolean;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
  onDelete?: () => void;
}

export function TeamCardMenuItems({
  variant,
  hasLogo,
  canDelete,
  onPickLogo,
  onRemoveLogo,
  onDelete,
}: TeamCardMenuItemsProps) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const MenuSeparator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;

  return (
    <>
      <Item onClick={onPickLogo}>
        <IconPhoto size={16} />
        {hasLogo ? "Change logo" : "Set logo"}
      </Item>
      {hasLogo ? (
        <Item onClick={onRemoveLogo}>
          <IconPhotoOff size={16} />
          Remove logo
        </Item>
      ) : null}
      {canDelete && onDelete ? (
        <>
          <MenuSeparator />
          <Item
            className="text-destructive"
            onClick={onDelete}
            title={skipConfirmTitle("Delete team")}
          >
            <IconTrash size={16} />
            Delete team
            <ConfirmSkipHint />
          </Item>
        </>
      ) : null}
    </>
  );
}
