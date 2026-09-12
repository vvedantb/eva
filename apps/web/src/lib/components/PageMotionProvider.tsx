"use client";

import { MotionConfig } from "motion/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@eva/backend";
import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";

const PageMotionContext = createContext(false);

/** Stamp `html[data-page-motion]` so CSS page/panel/modal keyframes skip. */
function applyPageMotionDataset(disabled: boolean): void {
  document.documentElement.dataset.pageMotion = disabled ? "off" : "on";
}

/**
 * Convex `disablePageMotion` experimental flag (false while flags are loading
 * or when this hook is used outside `PageMotionProvider`).
 */
export function useDisablePageMotion(): boolean {
  return useContext(PageMotionContext);
}

/**
 * Nested MotionConfig + `html[data-page-motion]` from the Convex flag.
 * Parent `MotionProvider` already pins `reducedMotion: never` so landing
 * (no Convex) never falls through to Motion's `user` / OS preference.
 */
export function PageMotionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const flags = useQuery(
    api.auth.getExperimentalFlags,
    isAuthenticated ? {} : "skip",
  );
  const disabled = flags?.disablePageMotion === true;

  useLayoutEffect(() => {
    applyPageMotionDataset(disabled);
  }, [disabled]);

  return (
    <PageMotionContext.Provider value={disabled}>
      <MotionConfig reducedMotion={disabled ? "always" : "never"}>
        {children}
      </MotionConfig>
    </PageMotionContext.Provider>
  );
}
