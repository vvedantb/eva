import { m, AnimatePresence } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  motionFast,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@eva/ui";
import {
  IconFolders,
  IconTrash,
  IconTags,
  IconUser,
  IconUserCheck,
  IconRefresh,
  IconPlayerPlay,
  IconCalendarClock,
  IconDots,
  IconX,
} from "@tabler/icons-react";
import { CountPop } from "@/lib/components/ui/CountPop";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

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
  onExitSelect: () => void;
  activeBulkAction: BulkAction | null;
  onSetBulkAction: (action: BulkAction | null) => void;
  /** Alt-click skips the confirm dialog for these actions. */
  onSkipConfirm?: Partial<Pick<Record<BulkAction, () => void>, "delete" | "run">>;
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

/**
 * A single labelled button inside the action bar. The label collapses to
 * icon-only below the `sm` breakpoint (HeroUI "responsive labels" pattern).
 */
function BarButton({
  action,
  disabled,
  onClick,
  showSkipHint,
}: {
  action: ActionDef;
  disabled: boolean;
  onClick: () => void;
  showSkipHint?: boolean;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      aria-label={action.label}
      title={showSkipHint ? skipConfirmTitle(action.label) : action.label}
      onClick={onClick}
      disabled={disabled}
      // `motion-press`, not `transition-colors`: the destructive Delete takes
      // this same branch, so the highest-consequence control in the bar was the
      // one with no acknowledgement at all before its confirm dialog appeared.
      className={`motion-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30 ${
        action.destructive
          ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon size={17} />
      <span className="hidden sm:inline">
        {action.shortLabel ?? action.label}
      </span>
      {showSkipHint ? <ConfirmSkipHint /> : null}
    </button>
  );
}

export function QuickTasksBulkBar({
  isSelecting,
  selectedCount,
  onExitSelect,
  activeBulkAction: _activeBulkAction,
  onSetBulkAction,
  onSkipConfirm,
}: QuickTasksBulkBarProps) {
  const hasSelection = selectedCount > 0;
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

  return (
    <AnimatePresence initial={false}>
      {isSelecting && (
        <m.div
          key="quick-tasks-bulk-bar"
          className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={motionFast}
        >
          <TooltipProvider>
            <div className="flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto rounded-surface bg-popover/95 px-2.5 py-2 backdrop-blur-md smooth-shadow-ring-lg scrollbar-none">
              {/* Prefix: selection count */}
              <div className="flex shrink-0 items-center gap-2 pl-1 pr-0.5">
                <CountPop
                  label={String(selectedCount)}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground tabular-nums"
                />
                <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
                  selected
                </span>
              </div>

              <Separator
                orientation="vertical"
                className="mx-1.5 h-5 shrink-0 bg-border"
              />

              {/* Content: primary actions + More dropdown */}
              {primaryActions.map((action) => (
                <BarButton
                  key={action.key}
                  action={action}
                  disabled={!hasSelection}
                  showSkipHint={action.key === "run"}
                  onClick={() => activate(action.key)}
                />
              ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More actions"
                    disabled={!hasSelection}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 data-[state=open]:bg-muted data-[state=open]:text-foreground"
                  >
                    <IconDots size={17} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" side="top" sideOffset={8}>
                  {moreActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <DropdownMenuItem
                        key={action.key}
                        disabled={!hasSelection}
                        onClick={() => onSetBulkAction(action.key)}
                      >
                        <Icon size={16} />
                        {action.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator
                orientation="vertical"
                className="mx-1.5 h-5 shrink-0 bg-border"
              />

              <BarButton
                action={deleteAction}
                disabled={!hasSelection}
                showSkipHint
                onClick={() => activate(deleteAction.key)}
              />

              <Separator
                orientation="vertical"
                className="mx-1.5 h-5 shrink-0 bg-border"
              />

              {/* Suffix: dismiss selection */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Cancel selection"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={onExitSelect}
                  >
                    <IconX size={17} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs" sideOffset={8}>
                  Cancel selection
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </m.div>
      )}
    </AnimatePresence>
  );
}
