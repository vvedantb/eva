"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useSessionStorage } from "usehooks-ts";
import {
  popInSidebarPanelNextFrame,
  popOutSidebarPanel,
} from "@/lib/components/sidebar/sidebarPanelMotion";

const COOKIE_NAME = "sidebar-collapsed";
const ONE_YEAR = 60 * 60 * 24 * 365;
const SESSIONS_NAV_MODE_KEY = "eva-sessions-nav-mode";

export type SessionsNavMode = "global" | "repo";

function readCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes(`${COOKIE_NAME}=true`);
}

function writeCookie(collapsed: boolean) {
  document.cookie = `${COOKIE_NAME}=${collapsed}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /**
   * Whether the below-`md` drawer is showing. Owned here rather than by
   * `Sidebar` because the drawer is the only way to reach a list on a phone,
   * so pages whose whole content is "select something from the sidebar" have
   * to be able to open it (`OpenNavigationButton`).
   */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Sticky entry point for Sessions: rail → global list, in-repo nav → per-repo list. */
  sessionsNavMode: SessionsNavMode;
  setSessionsNavMode: (mode: SessionsNavMode) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(readCookie);
  const [sessionsNavMode, setSessionsNavMode] =
    useSessionStorage<SessionsNavMode>(SESSIONS_NAV_MODE_KEY, "repo");
  // Not persisted: a drawer that reopens itself on the next visit is a bug, and
  // navigation closes it (see `Sidebar`), so the only meaningful value is now.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Every hide and show (rail tile, shortcut, search) passes here, so the
  // panel's dock motion lives here too.
  const setCollapsed = (value: boolean) => {
    writeCookie(value);
    if (value) {
      popOutSidebarPanel(() => setCollapsedState(true));
      return;
    }
    setCollapsedState(false);
    popInSidebarPanelNextFrame();
  };

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        mobileOpen,
        setMobileOpen,
        sessionsNavMode,
        setSessionsNavMode,
      }}
    >
      {children}
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
