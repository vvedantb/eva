import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import { Button, ButtonTrack, SidePanelTabs } from "@vvedantb/ui";
import { SandboxPanelToggleButton } from "./SandboxPanelToggleButton";

/**
 * The sandbox pane: the package side panel (`SidePanelTabs.Frame`). `tabBar` is the `SandboxTabBar`, a `SidePanelTabs.Rail`. The
 * frame owns the arrow and the card's dock motion; `popOutSidePanel` closes it.
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
    <SidePanelTabs.Frame
      collapsed={collapsed}
      rail={tabBar}
    >
      {children}
    </SidePanelTabs.Frame>
  );
}

/** Empty sandbox pane: collapse control only, no tabs. */
export function SandboxEmptyRailFrame({
  collapsed,
  onToggle,
  fill = false,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** The body fills the card (a list) instead of centring a message. */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row-reverse">
      <div className="relative z-20 hidden h-full w-11 shrink-0 flex-col items-center pb-1.5 pt-3 md:flex">
        <ButtonTrack direction="column">
          <SandboxPanelToggleButton collapsed={collapsed} onToggle={onToggle} />
        </ButtonTrack>
      </div>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1",
          fill ? "flex-col" : "items-center justify-center p-8",
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
  isPending,
}: {
  collapsed: boolean;
  onToggle: () => void;
  ownerLabel: "task" | "project";
  /** Undefined when this viewer or phase cannot start it. */
  onStart: (() => void) | undefined;
  isStarting: boolean;
  /** The session lookup is loading: show nothing rather than a false "none". */
  isPending: boolean;
}) {
  return (
    <SandboxEmptyRailFrame collapsed={collapsed} onToggle={onToggle}>
      {isPending ? null : (
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
      )}
    </SandboxEmptyRailFrame>
  );
}
