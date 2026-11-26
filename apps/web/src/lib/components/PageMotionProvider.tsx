"use client";

import { MotionConfig, MotionGlobalConfig } from "motion/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@eva/backend";
import { PageMotionProvider as BasePageMotionProvider } from "@vvedantb/ui";
import { useLayoutEffect, type ReactNode } from "react";

/**
 * Nested MotionConfig + `html[data-page-motion]` from the Convex
 * `disablePageMotion` experimental flag (off while flags are loading).
 * Parent `MotionProvider` already pins `reducedMotion: never` so landing
 * (no Convex) never falls through to Motion's `user` / OS preference.
 *
 * `reducedMotion: always` still runs opacity fades, so when disabled the
 * Motion global `instantAnimations` also snaps every Motion animation
 * (components and `animate()`) to its end value.
 */
export function PageMotionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const flags = useQuery(
    api.auth.getExperimentalFlags,
    isAuthenticated ? {} : "skip",
  );
  const disabled = flags?.disablePageMotion === true;

  // Syncs Motion's module-level config (an external system) with the flag.
  useLayoutEffect(() => {
    MotionGlobalConfig.instantAnimations = disabled;
  }, [disabled]);

  return (
    <BasePageMotionProvider disabled={disabled} motionConfig={MotionConfig}>
      {children}
    </BasePageMotionProvider>
  );
}
