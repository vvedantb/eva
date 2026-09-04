"use client";

import { createContext, useContext } from "react";

/**
 * The launcher's open/closed state, published for chrome that lives outside
 * `AveLauncherSurface`.
 *
 * Below `lg` there is no floating launcher — the mobile header owns the summon
 * button instead — and the header is rendered by `Sidebar`, a sibling of the
 * surface. A context is the only thing both can read without hoisting the
 * panel's state into a store nothing else needs.
 */
export interface AveLauncherContextValue {
  isOpen: boolean;
  /** On `/ave` the page *is* the chat, so every summon affordance goes away. */
  isHidden: boolean;
  /** Open when closed or minimized, minimize when open. */
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
