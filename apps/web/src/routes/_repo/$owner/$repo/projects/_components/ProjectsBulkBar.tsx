import { BulkActionBar, type BulkBarAction } from "@vvedantb/ui";
import { IconTrash } from "@tabler/icons-react";

interface ProjectsBulkBarProps {
  isSelecting: boolean;
  selectedCount: number;
  totalCount: number;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** Runs the delete flow, which owns its own confirm and Alt-to-skip. */
  onDelete: () => void;
}

/**
 * The projects board's selection bar. Same shell as quick tasks; the one
 * action projects have is delete (a project's stage is derived from its
 * tasks, so there is no phase to set).
 */
export function ProjectsBulkBar({
  isSelecting,
  selectedCount,
  totalCount,
  onExitSelect,
  onSelectAll,
  onClearSelection,
  onDelete,
}: ProjectsBulkBarProps) {
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
      primaryActions={[]}
      destructiveAction={deleteAction}
    />
  );
}
