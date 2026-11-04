import { ContextMenuItem, DropdownMenuItem } from "@vvedantb/ui";
import { IconTrash } from "@tabler/icons-react";

/**
 * The draft card's actions, hosted in either menu surface. Right-click covers
 * pointer devices; below `sm` a kebab re-hosts the same item, since touch has
 * nothing to right-click and deleting a draft was otherwise undiscoverable.
 */
export interface DraftCardMenuItemsProps {
  variant: "context" | "dropdown";
  onDelete: () => void;
}

export function DraftCardMenuItems({
  variant,
  onDelete,
}: DraftCardMenuItemsProps) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;

  return (
    <Item className="text-destructive" onClick={onDelete}>
      <IconTrash size={16} />
      Delete draft
    </Item>
  );
}
