import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@eva/ui";
import { Button } from "@vvedantb/ui";
import { SandboxPanelToggleButton } from "./SandboxPanelToggleButton";
import { SANDBOX_RAIL_GROUP_CLASS } from "./sandboxRail";
import {
  ACTIVE_TAB_SELECTOR,
  RAIL_TABLIST_SELECTOR,
  nudgeSandboxCard,
  popInSandboxCard,
} from "./sandboxCardMotion";

/** Half the arrow's side (`size-4`), so its centre lands on the tab centre. */
const ARROW_HALF_PX = 8;

/**
 * Keeps the card's arrow level with the active rail tab, and plays the card's
 * dock motion (`sandboxCardMotion`): pop in when the card appears, a settle
 * when the active tab changes. It writes the transform straight to the node
 * (no React state), as the tab pill does: the first placement snaps, later
 * moves slide (`.sandbox-tab-arrow`). The arrow hides when the active tab is
 * scrolled out of the card's height. Measure before animating: a scaled card
 * reports a scaled rect.
 */
function useActiveTabArrow(
  frameRef: RefObject<HTMLDivElement | null>,
  cardRef: RefObject<HTMLDivElement | null>,
  arrowRef: RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const card = cardRef.current;
    const arrow = arrowRef.current;
    if (!frame || !card || !arrow) return;
    let placed = false;
    // Start from what is on screen, so a mount or an `<Activity>` reveal
    // does not pop.
    let wasOpen = card.getBoundingClientRect().width > 0;
    let lastTab = frame.querySelector(ACTIVE_TAB_SELECTOR);
    const sync = () => {
      const tab = frame.querySelector<HTMLElement>(ACTIVE_TAB_SELECTOR);
      const f = frame.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const open = c.width > 0;
      const opened = open && !wasOpen;
      const switched = open && wasOpen && tab !== null && tab !== lastTab;
      wasOpen = open;
      if (tab) lastTab = tab;
      if (!tab || !open) {
        arrow.style.opacity = "0";
        placed = false;
        return;
      }
      const t = tab.getBoundingClientRect();
      const centre = t.top + t.height / 2;
      const inCard =
        centre > c.top + 2 * ARROW_HALF_PX &&
        centre < c.bottom - 2 * ARROW_HALF_PX;
      if (!inCard) {
        arrow.style.opacity = "0";
      } else {
        if (!placed) arrow.style.transition = "none";
        arrow.style.left = `${c.right - f.left - ARROW_HALF_PX - 1}px`;
        arrow.style.transform = `translateY(${centre - f.top - ARROW_HALF_PX}px) rotate(45deg)`;
        arrow.style.opacity = "1";
        if (!placed) {
          void arrow.offsetWidth;
          arrow.style.transition = "";
          placed = true;
        }
      }
      if (opened) popInSandboxCard(card);
      else if (switched) nudgeSandboxCard(card);
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(frame);
    // The card un-hides without the frame changing size.
    resize.observe(card);
    const mutation = new MutationObserver(sync);
    mutation.observe(frame, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    const list = frame.querySelector(RAIL_TABLIST_SELECTOR);
    if (list) resize.observe(list);
    // Tabs enter with a short slide (`ListEnter`) and the list re-centres as
    // tabs come and go, so re-measure once each motion settles.
    const settle = ["scroll", "animationend", "transitionend"] as const;
    for (const type of settle) frame.addEventListener(type, sync, true);
    return () => {
      resize.disconnect();
      mutation.disconnect();
      for (const type of settle) frame.removeEventListener(type, sync, true);
    };
  }, [frameRef, cardRef, arrowRef]);
}

/**
 * Desktop: tab rail on the right edge of the pane, the content a rounded card
 * beside it with an arrow pointing at the active tab. Collapsed hides the
 * card (`md:hidden`) so the rail stays. Mobile: column, tab strip on top,
 * content edge to edge — the pane switcher owns show/hide.
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
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  useActiveTabArrow(frameRef, cardRef, arrowRef);
  return (
    <div
      ref={frameRef}
      className="relative flex h-full min-h-0 flex-col md:flex-row-reverse"
    >
      {tabBar}
      {/* The arrow comes before the card, and the card is positioned, so the
          card paints over the arrow's inner half: only the tip shows, and
          content at the card's edge is never covered. */}
      <div
        ref={arrowRef}
        aria-hidden
        data-sandbox-card-arrow
        className={cn(
          "sandbox-tab-arrow pointer-events-none absolute top-0 hidden size-4 rounded-xs bg-card opacity-0 md:block",
          collapsed && "md:hidden",
        )}
      />
      <div
        ref={cardRef}
        data-sandbox-card
        className={cn(
          "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-card md:my-2 md:mr-1.5 md:rounded-surface",
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
        <div className={SANDBOX_RAIL_GROUP_CLASS}>
          <SandboxPanelToggleButton collapsed={collapsed} onToggle={onToggle} />
        </div>
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
