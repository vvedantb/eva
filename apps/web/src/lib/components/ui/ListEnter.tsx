"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { m } from "motion/react";
import { motionBase, motionFast, motionStagger } from "@eva/ui";

/**
 * First-paint / first-seen fade+slide. Pass `firstPaint` from the list so
 * Virtuoso recycle (and later overscan) does not restagger. Stable keys already
 * skip remount on Convex refresh.
 */
export function useFirstPaintGate() {
  const firstPaint = useRef(true);
  useEffect(() => {
    firstPaint.current = false;
  }, []);
  return firstPaint;
}

export function ListEnter({
  index,
  children,
  className,
  fast = false,
  firstPaint,
  staggerStep,
  staggerMax,
  slide = true,
  as = "div",
}: {
  index: number;
  children: ReactNode;
  className?: string;
  fast?: boolean;
  /** When `false`, skip enter (Virtuoso recycle / later overscan). */
  firstPaint?: boolean;
  staggerStep?: number;
  staggerMax?: number;
  /** Fade only — use on Gantt bars so the row does not shift. */
  slide?: boolean;
  /** `tr` / `li` when the parent is a table or list — an `m.div` wrapper is invalid HTML. */
  as?: "div" | "tr" | "li";
}) {
  const skip = firstPaint === false;
  const transition = fast ? motionFast : motionBase;
  const MotionTag = as === "tr" ? m.tr : as === "li" ? m.li : m.div;
  return (
    <MotionTag
      className={className}
      initial={skip ? false : { opacity: 0, y: slide ? 8 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...transition,
        delay: skip ? 0 : motionStagger(index, staggerStep, staggerMax),
      }}
    >
      {children}
    </MotionTag>
  );
}
