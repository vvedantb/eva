import { BulkActionBar, type BulkBarAction } from "@vvedantb/ui";
import { IconArchive, IconArchiveOff } from "@tabler/icons-react";

interface ProjectsBulkBarProps {
  isSelecting: boolean;
  selectedCount: number;
  totalCount: number;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** The Archived list: the one action is Unarchive. */
  archived: boolean;
  /** Runs the archive flow, which owns its own confirm and Alt-to-skip. */
  onArchive: () => void;
  onUnarchive: () => void;
}

/**
 * The projects board's selection bar. Same shell as quick tasks; the one
 * action projects have is archive, or unarchive in the Archived list (a
 * project's stage is derived from its tasks, so there is no phase to set).
 */
export function ProjectsBulkBar({
  isSelecting,
  selectedCount,
  totalCount,
  onExitSelect,
  onSelectAll,
  onClearSelection,
  archived,
  onArchive,
  onUnarchive,
}: ProjectsBulkBarProps) {
  const action: BulkBarAction = archived
    ? {
        key: "unarchive",
        label: "Unarchive All",
        shortLabel: "Unarchive",
        icon: IconArchiveOff,
        onClick: onUnarchive,
      }
    : {
        key: "archive",
        label: "Archive All",
        shortLabel: "Archive",
        icon: IconArchive,
        showSkipHint: true,
        onClick: onArchive,
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
      destructiveAction={action}
    />
  );
}
