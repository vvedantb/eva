"use client";

import { createContext, useContext } from "react";

/**
 * The launcher's open/closed state, published for chrome that lives outside
 * `AveLauncherSurface`.
 *
 * Below `md` there is no floating launcher — the mobile header owns the summon
 * button instead — and the header is rendered by `Sidebar`, a sibling of the
 * surface. A context is the only thing both can read without hoisting the
 * panel's state into a store nothing else needs.
 */
export interface AveLauncherContextValue {
  isOpen: boolean;
  isHidden: boolean;
  toggle: () => void;
}

const AveLauncherContext = createContext<AveLauncherContextValue | undefined>(
  undefined,
);

export const AveLauncherProviderContext = AveLauncherContext.Provider;

export function useAveLauncher(): AveLauncherContextValue {
  const context = useContext(AveLauncherContext);
  if (context === undefined) {
    throw new Error("useAveLauncher must be used within an AveLauncherProvider");
  }
  return context;
}
