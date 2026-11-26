"use client";

import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AveLauncherProviderContext } from "@/lib/components/ave/AveLauncherContext";
import { AveLauncherSurface } from "@/lib/components/ave/AveLauncherSurface";

type AvePanelState = "closed" | "open" | "minimized";

interface AveLauncherProviderProps {
  children: ReactNode;
  enabled: boolean;
}

/**
 * Mounts Manager Ave's floating launcher once, above the router outlet, so the
 * popover keeps its chat across every route change instead of remounting per
 * page. Lives in `AppShellChrome` for the same reason the sidebar does.
 *
 * The popover chrome is eager so the first click can play its spring. The
 * session tree stays in `AvePanelBody`, loaded on hover/focus or first open.
 *
 * The same state is published on a context because below `md` the summon
 * button is not the floating launcher at all — it is a header button rendered
 * by `Sidebar`, which sits inside this provider for exactly that reason.
 */
export function AveLauncherProvider({
  children,
  enabled,
}: AveLauncherProviderProps) {
  const [panel, setPanel] = useState<AvePanelState>("closed");
  const onAveRoute = useRouterState({
    select: (s) =>
      s.location.pathname === "/ave" || s.location.pathname.startsWith("/ave/"),
  });

  const minimize = () =>
    setPanel((prev) => (prev === "closed" ? prev : "minimized"));
  const open = () => setPanel("open");
  const isOpen = panel === "open";

  return (
    <AveLauncherProviderContext
      value={{
        isOpen,
        isHidden: onAveRoute,
        toggle: isOpen ? minimize : open,
      }}
    >
      {children}
      {enabled ? (
        <AveLauncherSurface
          isOpen={isOpen}
          isMounted={panel !== "closed"}
          isHidden={onAveRoute}
          onOpen={open}
          onMinimize={minimize}
        />
      ) : null}
    </AveLauncherProviderContext>
  );
}
