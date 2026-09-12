"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";

/**
 * Single app-wide Motion feature bundle. Consumers should import `m` from
 * `motion/react` (not `motion`) so the animation graph stays out of entry
 * chunks and loads lazily — see react-doctor/use-lazy-motion.
 *
 * Uses `domMax` (not `domAnimation`) because the sidebar nav relies on shared
 * `layoutId` transitions (SharedLayoutNav); layout animations live only in the
 * `domMax` feature set. Under `strict`, a missing feature silently no-ops the
 * animation, so `domAnimation` here would kill the sliding nav highlight.
 *
 * `reducedMotion: never` is the app default (the animation contract forbids
 * OS `prefers-reduced-motion`). Signed-in users can override via the Convex
 * `disablePageMotion` flag, applied by `PageMotionProvider` inside Convex.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="never">{children}</MotionConfig>
    </LazyMotion>
  );
}
