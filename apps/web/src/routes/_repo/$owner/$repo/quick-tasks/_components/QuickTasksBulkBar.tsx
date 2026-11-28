import {
  IconArchive,
  IconFolders,
  IconTags,
  IconUser,
  IconUserCheck,
  IconRefresh,
  IconPlayerPlay,
  IconCalendarClock,
} from "@tabler/icons-react";
import {
  useRequestConfirm,
  BulkActionBar,
  type BulkBarAction,
} from "@vvedantb/ui";

export type BulkAction =
  | "actions"
  | "group"
  | "archive"
  | "addLabels"
  | "assign"
  | "assignMe"
  | "changeStatus"
  | "run"
  | "schedule";

interface QuickTasksBulkBarProps {
  isSelecting: boolean;
  selectedCount: number;
  totalCount: number;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  activeBulkAction: BulkAction | null;
  onSetBulkAction: (action: BulkAction | null) => void;
  onSkipConfirm?: Partial<
    Pick<Record<BulkAction, () => void>, "archive" | "run">
  >;
}

interface ActionDef {
  key: BulkAction;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
  destructive?: boolean;
}

const primaryActions: ActionDef[] = [
  {
    key: "changeStatus",
    label: "Change Status",
    shortLabel: "Status",
    icon: IconRefresh,
  },
  {
    key: "assign",
    label: "Assign to...",
    shortLabel: "Assign",
    icon: IconUser,
  },
  { key: "run", label: "Run Tasks", shortLabel: "Run", icon: IconPlayerPlay },
];

const moreActions: ActionDef[] = [
  { key: "assignMe", label: "Assign to Me", icon: IconUserCheck },
  { key: "addLabels", label: "Add Labels", icon: IconTags },
  { key: "group", label: "Group into Project", icon: IconFolders },
  { key: "schedule", label: "Schedule Run", icon: IconCalendarClock },
];

const archiveAction: ActionDef = {
  key: "archive",
  label: "Archive All",
  shortLabel: "Archive",
  icon: IconArchive,
};

export function QuickTasksBulkBar({
  isSelecting,
  selectedCount,
  totalCount,
  onExitSelect,
  onSelectAll,
  onClearSelection,
  activeBulkAction: _activeBulkAction,
  onSetBulkAction,
  onSkipConfirm,
}: QuickTasksBulkBarProps) {
  const { request: requestConfirm } = useRequestConfirm();

  const activate = (action: BulkAction) => {
    const skip =
      action === "archive" || action === "run"
        ? onSkipConfirm?.[action]
        : undefined;
    if (skip) {
      requestConfirm(() => onSetBulkAction(action), skip);
      return;
    }
    onSetBulkAction(action);
  };

  const toBarAction = (action: ActionDef): BulkBarAction => ({
    ...action,
    showSkipHint: action.key === "run" || action.key === "archive",
    onClick: () => activate(action.key),
  });

  return (
    <BulkActionBar
      barKey="quick-tasks-bulk-bar"
      isSelecting={isSelecting}
      selectedCount={selectedCount}
      totalCount={totalCount}
      onExitSelect={onExitSelect}
      onSelectAll={onSelectAll}
      onClearSelection={onClearSelection}
      primaryActions={primaryActions.map(toBarAction)}
      moreActions={moreActions.map((action) => ({
        ...action,
        onClick: () => onSetBulkAction(action.key),
      }))}
      destructiveAction={toBarAction(archiveAction)}
    />
  );
}
