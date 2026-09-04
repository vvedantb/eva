"use client";

import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocalStorage, useSessionStorage } from "usehooks-ts";
import { rubberband } from "@eva/ui";

const COOKIE_NAME = "sidebar-collapsed";
const ONE_YEAR = 60 * 60 * 24 * 365;
const SESSIONS_NAV_MODE_KEY = "eva-sessions-nav-mode";
const SIDEBAR_WIDTH_KEY = "eva-sidebar-width";

/** Matches previous `lg:w-80` default for rail + secondary panel. */
const SIDEBAR_DEFAULT_WIDTH_PX = 320;
/** Narrow enough to reclaim canvas; still fits nav labels. */
export const SIDEBAR_MIN_WIDTH_PX = 240;
/** Caps growth so chat/canvas keep usable space on laptop widths. */
export const SIDEBAR_MAX_WIDTH_PX = 480;

export type SessionsNavMode = "global" | "repo";

function readCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes(`${COOKIE_NAME}=true`);
}

function writeCookie(collapsed: boolean) {
  document.cookie = `${COOKIE_NAME}=${collapsed}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

function clampSidebarWidth(width: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH_PX,
    Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(width)),
  );
}

function rubberbandSidebarWidth(width: number): number {
  if (width < SIDEBAR_MIN_WIDTH_PX) {
    return (
      SIDEBAR_MIN_WIDTH_PX -
      rubberband(SIDEBAR_MIN_WIDTH_PX - width, SIDEBAR_MIN_WIDTH_PX)
    );
  }
  if (width > SIDEBAR_MAX_WIDTH_PX) {
    return (
      SIDEBAR_MAX_WIDTH_PX +
      rubberband(width - SIDEBAR_MAX_WIDTH_PX, SIDEBAR_MAX_WIDTH_PX)
    );
  }
  return Math.round(width);
}

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /**
   * Whether the below-`lg` drawer is showing. Owned here rather than by
   * `Sidebar` because the drawer is the only way to reach a list on a phone,
   * so pages whose whole content is "select something from the sidebar" have
   * to be able to open it (`OpenNavigationButton`).
   */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Sticky entry point for Sessions: rail → global list, in-repo nav → per-repo list. */
  sessionsNavMode: SessionsNavMode;
  setSessionsNavMode: (mode: SessionsNavMode) => void;
  /**
   * Desktop width (px) of the fixed left chrome when the secondary panel is
   * open — icon rail + app/repo or sessions column. Persisted across routes.
   * During a live drag this may briefly overshoot min/max (rubberband).
   */
  sidebarWidth: number;
  /** Keyboard / non-drag updates — always clamped and persisted. */
  setSidebarWidth: (width: number) => void;
  /** Live drag preview — rubberbands past bounds, not persisted. */
  previewSidebarWidth: (width: number) => void;
  /** End of drag — clamp, persist, clear preview. */
  commitSidebarWidth: (width: number) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(readCookie);
  const [sessionsNavMode, setSessionsNavMode] =
    useSessionStorage<SessionsNavMode>(SESSIONS_NAV_MODE_KEY, "repo");
  const [sidebarWidth, setSidebarWidthState] = useLocalStorage(
    SIDEBAR_WIDTH_KEY,
    SIDEBAR_DEFAULT_WIDTH_PX,
  );
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    writeCookie(value);
  };

  const clampedWidth = clampSidebarWidth(sidebarWidth);
  const displayWidth = dragWidth ?? clampedWidth;

  const setSidebarWidth = (width: number) => {
    setSidebarWidthState(clampSidebarWidth(width));
    setDragWidth(null);
  };

  const previewSidebarWidth = (width: number) => {
    setDragWidth(rubberbandSidebarWidth(width));
  };

  const commitSidebarWidth = (width: number) => {
    setSidebarWidthState(clampSidebarWidth(width));
    setDragWidth(null);
  };

  const cssVars: CSSProperties & Record<`--${string}`, string> = {
    "--eva-sidebar-width": `${displayWidth}px`,
  };

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        sessionsNavMode,
        setSessionsNavMode,
        sidebarWidth: displayWidth,
        setSidebarWidth,
        previewSidebarWidth,
        commitSidebarWidth,
      }}
    >
      <div className="contents" style={cssVars}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
