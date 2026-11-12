import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import { Button } from "@vvedantb/ui";
import { SandboxPanelToggleButton } from "./SandboxPanelToggleButton";

/**
 * Desktop: tab rail on the right edge of the pane. Collapsed hides the
 * content (`md:hidden`) so the rail stays. Mobile: column, tab strip on top,
 * content always shown — the pane switcher owns show/hide.
 */
export function SandboxPanelFrame({
  collapsed,
  tabBar,
  children,
}: {
  collapsed: boolean;
  tabBar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row-reverse">
      {tabBar}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-hidden bg-card",
          collapsed && "md:hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Empty sandbox pane: collapse control only, no tabs. */
export function SandboxEmptyRailFrame({
  collapsed,
  onToggle,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row-reverse">
      <div className="relative z-20 hidden h-full w-11 shrink-0 flex-col items-center pb-1.5 pt-3 md:flex">
        <SandboxPanelToggleButton collapsed={collapsed} onToggle={onToggle} />
      </div>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 items-center justify-center p-8",
          collapsed && "md:hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The sandbox pane of a task or project whose session does not exist yet:
 * there is no sandbox, so no panes, preview or terminals. Start creates the
 * session and boots it.
 */
export function SandboxNotStartedRail({
  collapsed,
  onToggle,
  ownerLabel,
  onStart,
  isStarting,
}: {
  collapsed: boolean;
  onToggle: () => void;
  ownerLabel: "task" | "project";
  /** Undefined when this viewer or phase cannot start it. */
  onStart: (() => void) | undefined;
  isStarting: boolean;
}) {
  return (
    <SandboxEmptyRailFrame collapsed={collapsed} onToggle={onToggle}>
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          This {ownerLabel} has no sandbox yet.
        </p>
        {onStart ? (
          <Button size="sm" onClick={onStart} disabled={isStarting}>
            {isStarting ? "Starting…" : "Start sandbox"}
          </Button>
        ) : null}
      </div>
    </SandboxEmptyRailFrame>
  );
}
