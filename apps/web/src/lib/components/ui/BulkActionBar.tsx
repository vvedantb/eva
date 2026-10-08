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
import { IconDots, IconX } from "@tabler/icons-react";
import type { ComponentType } from "react";
import { CountPop } from "@/lib/components/ui/CountPop";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

/**
 * One control in the bar. The bar is deliberately dumb: each action carries the
 * handler it should run, so confirm dialogs, Alt-to-skip and any per-surface
 * bookkeeping stay with the caller that owns that state.
 */
export interface BulkBarAction {
  key: string;
  /** Full label used in the More menu and for accessibility. */
  label: string;
  /** Shorter label shown inline in the bar (defaults to `label`). */
  shortLabel?: string;
  icon: ComponentType<{ size: number; className?: string }>;
  destructive?: boolean;
  /** Shows the Alt-to-skip hint; the caller still owns the skip itself. */
  showSkipHint?: boolean;
  onClick: () => void;
}

interface BulkActionBarProps {
  isSelecting: boolean;
  selectedCount: number;
  totalCount: number;
  onExitSelect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  primaryActions: ReadonlyArray<BulkBarAction>;
  moreActions?: ReadonlyArray<BulkBarAction>;
  destructiveAction?: BulkBarAction;
  /** Motion key for the presence animation, e.g. "quick-tasks-bulk-bar". */
  barKey: string;
}

/**
 * A single labelled button inside the action bar. The label collapses to
 * icon-only below the `sm` breakpoint (HeroUI "responsive labels" pattern).
 */
function BarButton({
  action,
  disabled,
}: {
  action: BulkBarAction;
  disabled: boolean;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      aria-label={action.label}
      title={
        action.showSkipHint ? skipConfirmTitle(action.label) : action.label
      }
      onClick={action.onClick}
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
      {action.showSkipHint ? <ConfirmSkipHint /> : null}
    </button>
  );
}

/**
 * The floating selection bar shared by every list that supports bulk actions —
 * quick tasks, the projects board, the inbox. It owns the shell only: presence
 * motion, the count, select-all/clear, the primary buttons, the More menu and
 * the destructive slot on the right. Behaviour arrives as `onClick` per action.
 */
export function BulkActionBar({
  isSelecting,
  selectedCount,
  totalCount,
  onExitSelect,
  onSelectAll,
  onClearSelection,
  primaryActions,
  moreActions,
  destructiveAction,
  barKey,
}: BulkActionBarProps) {
  const hasSelection = selectedCount > 0;
  const allSelected = totalCount > 0 && selectedCount >= totalCount;

  return (
    <AnimatePresence initial={false}>
      {isSelecting && (
        <m.div
          key={barKey}
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

              {/* Reaching the whole list is the one action a selection bar can
                  offer that the rows cannot: shift-clicking to the end of a
                  long list is the alternative. */}
              {totalCount > 0 && (
                <button
                  type="button"
                  onClick={allSelected ? onClearSelection : onSelectAll}
                  className="motion-press inline-flex h-9 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.96]"
                >
                  {allSelected ? "Clear" : `Select all (${totalCount})`}
                </button>
              )}

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
                />
              ))}

              {moreActions && moreActions.length > 0 && (
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
                          onClick={action.onClick}
                        >
                          <Icon size={16} />
                          {action.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {destructiveAction && (
                <>
                  <Separator
                    orientation="vertical"
                    className="mx-1.5 h-5 shrink-0 bg-border"
                  />
                  <BarButton
                    action={destructiveAction}
                    disabled={!hasSelection}
                  />
                </>
              )}

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
