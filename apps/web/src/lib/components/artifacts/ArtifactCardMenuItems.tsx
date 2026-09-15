import { ContextMenuItem, DropdownMenuItem } from "@eva/ui";
import {
  IconExternalLink,
  IconLayoutDashboard,
  IconMessage,
  IconTrash,
} from "@tabler/icons-react";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

/**
 * The artifact tile's actions, hosted in either menu surface. Right-click covers
 * pointer devices; below `sm` a kebab re-hosts the same items, since touch has
 * nothing to right-click and the tile carried no visible affordance at all.
 */
export interface ArtifactCardMenuItemsProps {
  variant: "context" | "dropdown";
  onOpen: () => void;
  onOpenInNewTab: () => void;
  onOpenSource?: () => void;
  sourceLabel?: string;
  onDelete: () => void;
}

export function ArtifactCardMenuItems({
  variant,
  onOpen,
  onOpenInNewTab,
  onOpenSource,
  sourceLabel,
  onDelete,
}: ArtifactCardMenuItemsProps) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;

  return (
    <>
      <Item onClick={onOpen}>
        <IconLayoutDashboard size={16} />
        Open
      </Item>
      <Item onClick={onOpenInNewTab}>
        <IconExternalLink size={16} />
        Open in new tab
      </Item>
      {onOpenSource && sourceLabel ? (
        <Item onClick={onOpenSource}>
          <IconMessage size={16} />
          Open {sourceLabel}
        </Item>
      ) : null}
      <Item
        className="text-destructive"
        onClick={onDelete}
        title={skipConfirmTitle("Delete")}
      >
        <IconTrash size={16} />
        Delete
        <ConfirmSkipHint />
      </Item>
    </>
  );
}
