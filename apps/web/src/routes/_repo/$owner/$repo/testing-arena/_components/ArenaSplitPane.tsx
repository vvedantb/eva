import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Spinner, transitionFast } from "@vvedantb/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";

/**
 * List / detail layout shared by the Code and Browser tabs. Stacks below `sm`.
 * `detailKey` crossfades the detail pane when the selection changes.
 */
export function ArenaSplitPane({
  list,
  detail,
  detailKey,
}: {
  list: ReactNode;
  detail: ReactNode;
  detailKey: string | null;
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden sm:flex-row">
      <div className="w-full shrink-0 border-b overflow-y-auto scrollbar p-2 space-y-1 max-h-32 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
        {list}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar p-4">
        <AnimatePresence mode="wait" initial={false}>
          {detailKey !== null ? (
            <m.div
              key={detailKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitionFast}
            >
              {detail}
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** One selectable row in the split pane's list (a run, or the Browser tab's scenarios). */
export function ArenaListButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 ${
        isActive
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-transparent hover:bg-muted/50"
      }`}
    >
      {children}
    </button>
  );
}

/** Section label above the run list. */
export function ArenaListLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium text-muted-foreground px-2 py-1">
      {children}
    </p>
  );
}

/** List-row body for a run that has not completed: running spinner or error. */
export function ArenaRunStatusRow({
  status,
  createdAt,
}: {
  status: "pending" | "running" | "completed" | "error";
  createdAt: number;
}) {
  if (status === "error") {
    return (
      <>
        <IconAlertTriangle size={14} className="text-destructive shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-destructive">Error</span>
          <RelativeDateTime
            at={createdAt}
            className="text-xs text-muted-foreground"
          />
        </div>
      </>
    );
  }
  if (status === "running") {
    return (
      <>
        <Spinner size="sm" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-muted-foreground">Running...</span>
          <RelativeDateTime
            at={createdAt}
            className="text-xs text-muted-foreground"
          />
        </div>
      </>
    );
  }
  return null;
}
