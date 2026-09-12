"use client";

import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { PageMotionProvider } from "@/lib/components/PageMotionProvider";

/**
 * Single app-wide Motion feature bundle. Consumers should import `m` from
 * `motion/react` (not `motion`) so the animation graph stays out of entry
 * chunks and loads lazily — see react-doctor/use-lazy-motion.
 *
 * Uses `domMax` (not `domAnimation`) because the sidebar nav relies on shared
 * `layoutId` transitions (SharedLayoutNav); layout animations live only in the
 * `domMax` feature set. Under `strict`, a missing feature silently no-ops the
 * animation, so `domAnimation` here would kill the sliding nav highlight.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <PageMotionProvider>{children}</PageMotionProvider>
    </LazyMotion>
  );
}
