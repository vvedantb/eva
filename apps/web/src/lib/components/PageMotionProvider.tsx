"use client";

import { MotionConfig } from "motion/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@eva/backend";
import { PageMotionProvider as BasePageMotionProvider } from "@vvedantb/ui";
import type { ReactNode } from "react";

/**
 * Nested MotionConfig + `html[data-page-motion]` from the Convex
 * `disablePageMotion` experimental flag (off while flags are loading).
 * Parent `MotionProvider` already pins `reducedMotion: never` so landing
 * (no Convex) never falls through to Motion's `user` / OS preference.
 */
export function PageMotionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const flags = useQuery(
    api.auth.getExperimentalFlags,
    isAuthenticated ? {} : "skip",
  );

  return (
    <BasePageMotionProvider
      disabled={flags?.disablePageMotion === true}
      motionConfig={MotionConfig}
    >
      {children}
    </BasePageMotionProvider>
  );
}
