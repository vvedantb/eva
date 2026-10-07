"use client";

import { cn } from "@eva/ui";
import { m } from "motion/react";
import {
  createContext,
  use,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";

// shared-layout pill slide between sidebar rows
const sidebarSharedLayoutTransition = {
  type: "tween" as const,
  duration: 0.08,
  ease: "easeOut" as const,
};

interface SharedLayoutNavContextValue {
  layoutId: string;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}

const SharedLayoutNavContext =
  createContext<SharedLayoutNavContextValue | null>(null);

function useSharedLayoutNav() {
  const context = use(SharedLayoutNavContext);
  if (!context) {
    throw new Error(
      "SharedLayoutNavSurface must be used within SharedLayoutNav",
    );
  }
  return context;
}

/** Active surface for vertical rail tiles — matches sidebar nav pill. */
export const railTileActiveClass = "bg-sidebar-accent text-sidebar-primary";

const sidebarNavPillClass =
  "pointer-events-none absolute inset-0 rounded-menu-item bg-sidebar-accent";

/** Animated nav list — shared `layoutId` background slides between items on hover/active. */
export function SharedLayoutNav({
  layoutId,
  children,
  className,
}: {
  layoutId: string;
  children: ReactNode;
  className?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <SharedLayoutNavContext value={{ layoutId, hoveredId, setHoveredId }}>
      <div className={className} onMouseLeave={() => setHoveredId(null)}>
        {children}
      </div>
    </SharedLayoutNavContext>
  );
}

/**
 * Per-item surface; highlight follows hover, else the active route.
 *
 * Remaining props land on the outer element so the surface can be the child of
 * an `asChild` trigger (context menus, tooltips) — those pass their handlers and
 * ref down as props, and a surface that swallowed them would never open.
 */
export function SharedLayoutNavSurface({
  itemId,
  isActive,
  children,
  className,
  ...rest
}: ComponentPropsWithRef<"div"> & {
  itemId: string;
  isActive: boolean;
}) {
  const { layoutId, hoveredId, setHoveredId } = useSharedLayoutNav();
  // Resting active uses a static fill — `layoutId` inside AnimatePresence
  // parents (session rows) often fails to paint until hover remounts it.
  const showStaticActive = hoveredId === null && isActive;
  const showSlidingPill = hoveredId === itemId;

  return (
    <div
      {...rest}
      className={cn("relative", className)}
      onMouseEnter={() => setHoveredId(itemId)}
    >
      {showStaticActive ? <div className={sidebarNavPillClass} /> : null}
      {showSlidingPill ? (
        <m.div
          layoutId={layoutId}
          transition={sidebarSharedLayoutTransition}
          className={sidebarNavPillClass}
        />
      ) : null}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function sidebarNavLinkClass(
  isActive: boolean,
  collapsed?: boolean,
): string {
  return cn(
    // `motion-press`, not `motion-base`: these rows are the most-pressed
    // controls in the app and the rail tiles beside them already answer a
    // pointer-down (`RepoRail`), so a nav row that stayed still read as the
    // dead one of the pair. 0.99 because the row is full-width — the same
    // figure `ListRow` uses, where a deeper scale on a 20rem-wide target
    // looks like the panel flexing rather than the row acknowledging.
    "group motion-press active:scale-[0.99] flex w-full items-center gap-2 rounded-menu-item px-4 py-1.5 text-[13px] leading-[18px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring/35",
    collapsed && "lg:justify-center lg:px-0",
    isActive
      ? "font-medium text-sidebar-primary"
      : "text-sidebar-foreground/80 hover:text-sidebar-foreground",
  );
}

/** Section group label above a cluster of sidebar nav rows (Build / Ship / …). */
export const sidebarSectionLabelClass =
  "px-4 py-1 text-[11px] font-medium tracking-[-0.01em] text-muted-foreground/55";

export function sidebarNavLinkClassCompact(isActive: boolean): string {
  return cn(
    "group motion-press active:scale-[0.99] flex w-full items-center gap-2.5 rounded-menu-item px-4 py-1.5 text-[13px] leading-[18px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring/35",
    isActive
      ? "font-medium text-sidebar-primary"
      : "text-sidebar-foreground/80 hover:text-sidebar-foreground",
  );
}
