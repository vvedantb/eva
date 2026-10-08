"use client";

import { Button } from "@eva/ui";
import { IconArrowLeft } from "@tabler/icons-react";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

export interface PageHeaderProps {
  title?: React.ReactNode;
  /**
   * Sits beside the title, before `headerRight`. For navigation that belongs
   * with "where am I" rather than the action cluster — e.g. the main/sandbox
   * surface switcher. Centred over the title row at `sm` and up; below that it
   * takes its own row under the title.
   */
  titleAfter?: React.ReactNode;
  headerCenter?: React.ReactNode;
  headerRight?: React.ReactNode;
  /**
   * Secondary refine row under the title (filters, search, segmented controls).
   * Kept out of `headerRight` so the title row stays quiet.
   */
  toolbar?: React.ReactNode;
  /** Route / view tabs under the title (and under toolbar when both exist). */
  tabs?: React.ReactNode;
  /**
   * Indent the title row by the card gutter (`px-4`) so the page title lines up
   * with the section titles inside the cards below, rather than with the card
   * edge. For settings-shaped pages; leave off for list pages whose card has no
   * section heading to align to.
   */
  insetHeader?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  comfortable?: boolean;
}

/**
 * The page title row (title, actions, toolbar, tabs). Rendered above the page
 * body by `PageWrapper`, or placed directly by a split view that wants the
 * header inside its left column so the detail pane keeps the full height.
 */
export function PageHeader({
  title,
  titleAfter,
  headerCenter,
  headerRight,
  toolbar,
  tabs,
  insetHeader = false,
  showBack = false,
  onBack,
  comfortable = false,
}: PageHeaderProps) {
  const isStringTitle = typeof title === "string";
  const hasHeaderRight = headerRight != null;
  const hasToolbar = toolbar != null;
  const hasTabs = tabs != null;
  // Below `sm` the title row cannot hold a second control: a breadcrumb sharing
  // the row with a three-segment tab control collapses to a few pixels and its
  // trigger stops being tappable. `titleAfter` gets its own row there instead.
  const isPhone = useMediaQuery("(max-width: 639px)");
  const titleAfterInline = titleAfter != null && !isPhone;
  const titleAfterOwnRow = titleAfter != null && isPhone;

  return (
    <div
      className={`motion-base relative ${comfortable ? "px-4 py-6 sm:px-6" : "p-3 sm:px-4"}`}
    >
      <div
        className={`relative grid items-center gap-2 sm:gap-3 ${hasHeaderRight ? "grid-cols-[minmax(0,1fr)_minmax(0,auto)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1"} ${comfortable ? "mx-auto w-full max-w-5xl" : ""} ${insetHeader ? "px-4" : ""}`}
      >
        <div
          className={`flex min-w-0 items-center gap-2 sm:gap-3 ${hasHeaderRight && !headerCenter ? "md:col-span-2" : ""}`}
        >
          {showBack && (
            <Button
              size="icon"
              variant="outline"
              onClick={onBack ?? (() => window.history.back())}
              aria-label="Go back"
              className="motion-press max-sm:hit-target h-9 w-9 shrink-0 rounded-full hover:scale-[1.03] active:scale-[0.96]"
            >
              <IconArrowLeft size={16} className="text-muted-foreground" />
            </Button>
          )}
          {title && (
            <h1
              /* Capped short of the row's centre when `titleAfter` is
                 centred over it, so a long title truncates instead of
                 sliding under the absolutely positioned control. */
              className={`min-w-0 flex-1 ${titleAfterInline ? "sm:max-w-[calc(75%-4rem)]" : ""} text-base font-semibold tracking-[-0.02em] text-foreground sm:text-lg md:text-xl animate-in fade-in slide-in-from-left-1 duration-300 ${isStringTitle ? "hidden whitespace-nowrap text-balance lg:block" : "overflow-hidden"}`}
            >
              {title}
            </h1>
          )}
          {/* Centred on the row itself rather than placed in the flow: the
              title and action clusters are both variable-width, so any
              in-flow position drifts with them. Absolute keeps it fixed at
              the row's centre and out of the layout entirely. Below `sm`
              there is no room for it on this row at all, so it moves to its
              own full-width row under the title (rendered below). */}
          {titleAfterInline && (
            <div className="shrink-0 sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
              {titleAfter}
            </div>
          )}
        </div>
        {headerCenter && (
          <div className="hidden min-w-0 justify-center md:flex animate-in fade-in duration-300">
            <div className="w-full max-w-xl">{headerCenter}</div>
          </div>
        )}
        {hasHeaderRight ? (
          <div className="flex min-h-10 max-sm:min-w-0 max-sm:flex-wrap items-center justify-end gap-1.5 sm:gap-2 justify-self-end animate-in fade-in slide-in-from-right-1 duration-300">
            {headerRight}
          </div>
        ) : null}
      </div>
      {titleAfterOwnRow && (
        <div className="mt-2 min-w-0 overflow-x-auto scrollbar-none">
          {titleAfter}
        </div>
      )}
      {headerCenter && (
        <div className="mt-2 md:hidden animate-in fade-in duration-300">
          {headerCenter}
        </div>
      )}
      {hasToolbar || hasTabs ? (
        <div
          className={`mt-3 space-y-3 ${comfortable ? "mx-auto w-full max-w-5xl" : ""}`}
        >
          {hasToolbar ? (
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 sm:gap-2">
              {toolbar}
            </div>
          ) : null}
          {hasTabs ? (
            <div className="min-w-0 max-sm:max-w-full max-sm:overflow-x-auto scrollbar">
              {tabs}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
