import { IconRefresh, IconTrash } from "@tabler/icons-react";
import {
  BulkActionBar,
  type BulkBarAction,
} from "@/lib/components/ui/BulkActionBar";

/** Bulk actions that open their own dialog. Delete owns its confirm elsewhere. */
export type ProjectBulkAction = "phase";

interface ProjectsBulkBarProps {
  isSelecting: boolean;
  selectedCount: number;
  totalCount: number;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSetBulkAction: (action: ProjectBulkAction | null) => void;
  /** Runs the delete flow, which owns its own confirm and Alt-to-skip. */
  onDelete: () => void;
}

/**
 * The projects board's selection bar. Same shell as quick tasks — only the two
 * actions projects have differ: move the selection to a phase, or delete it.
 */
export function ProjectsBulkBar({
  isSelecting,
  selectedCount,
  totalCount,
  onExitSelect,
  onSelectAll,
  onClearSelection,
  onSetBulkAction,
  onDelete,
}: ProjectsBulkBarProps) {
  const phaseAction: BulkBarAction = {
    key: "phase",
    label: "Change Phase",
    shortLabel: "Phase",
    icon: IconRefresh,
    onClick: () => onSetBulkAction("phase"),
  };

  const deleteAction: BulkBarAction = {
    key: "delete",
    label: "Delete All",
    shortLabel: "Delete",
    icon: IconTrash,
    destructive: true,
    showSkipHint: true,
    onClick: onDelete,
  };

  return (
    <BulkActionBar
      barKey="projects-bulk-bar"
      isSelecting={isSelecting}
      selectedCount={selectedCount}
      totalCount={totalCount}
      onExitSelect={onExitSelect}
      onSelectAll={onSelectAll}
      onClearSelection={onClearSelection}
      primaryActions={[phaseAction]}
      destructiveAction={deleteAction}
    />
  );
}
