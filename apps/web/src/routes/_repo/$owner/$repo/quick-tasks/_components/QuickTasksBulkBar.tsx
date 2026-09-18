import {
  IconFolders,
  IconTrash,
  IconTags,
  IconUser,
  IconUserCheck,
  IconRefresh,
  IconPlayerPlay,
  IconCalendarClock,
} from "@tabler/icons-react";
import {
  BulkActionBar,
  type BulkBarAction,
} from "@/lib/components/ui/BulkActionBar";
import { requestConfirm, useAltHeld } from "@/lib/confirm";

export type BulkAction =
  | "actions"
  | "group"
  | "delete"
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
  /** Alt-click skips the confirm dialog for these actions. */
  onSkipConfirm?: Partial<
    Pick<Record<BulkAction, () => void>, "delete" | "run">
  >;
}

interface ActionDef {
  key: BulkAction;
  /** Full label used in the More menu and for accessibility. */
  label: string;
  /** Shorter label shown inline in the bar (defaults to `label`). */
  shortLabel?: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
  destructive?: boolean;
}

/** Actions shown directly in the bar with responsive labels. */
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

/** Secondary actions tucked into the "More" dropdown to keep the bar compact. */
const moreActions: ActionDef[] = [
  { key: "assignMe", label: "Assign to Me", icon: IconUserCheck },
  { key: "addLabels", label: "Add Labels", icon: IconTags },
  { key: "group", label: "Group into Project", icon: IconFolders },
  { key: "schedule", label: "Schedule Run", icon: IconCalendarClock },
];

const deleteAction: ActionDef = {
  key: "delete",
  label: "Delete All",
  shortLabel: "Delete",
  icon: IconTrash,
  destructive: true,
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
  const altHeld = useAltHeld();

  const activate = (action: BulkAction) => {
    const skip =
      action === "delete" || action === "run"
        ? onSkipConfirm?.[action]
        : undefined;
    if (skip) {
      requestConfirm(altHeld, () => onSetBulkAction(action), skip);
      return;
    }
    onSetBulkAction(action);
  };

  /** Only `run` and `delete` have an Alt-to-skip path to advertise. */
  const toBarAction = (action: ActionDef): BulkBarAction => ({
    ...action,
    showSkipHint: action.key === "run" || action.key === "delete",
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
      destructiveAction={toBarAction(deleteAction)}
    />
  );
}
