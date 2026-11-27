import { BulkActionBar, type BulkBarAction } from "@vvedantb/ui";
import { IconArchive } from "@tabler/icons-react";

interface ProjectsBulkBarProps {
  isSelecting: boolean;
  selectedCount: number;
  totalCount: number;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onArchive: () => void;
}

/**
 * The projects board's selection bar. Same shell as quick tasks; the one
 * action projects have is archive (a project's stage is derived from its
 * tasks, so there is no phase to set). The Archived list has no select mode.
 */
export function ProjectsBulkBar({
  isSelecting,
  selectedCount,
  totalCount,
  onExitSelect,
  onSelectAll,
  onClearSelection,
  onArchive,
}: ProjectsBulkBarProps) {
  const archiveAction: BulkBarAction = {
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
      destructiveAction={archiveAction}
    />
  );
}
