"use client";

import type { ComponentPropsWithRef, ReactNode, Ref } from "react";
import { AnimatePresence, m } from "motion/react";

import { cn } from "../utils/cn";
import { motionSlow } from "../utils/motion";
import { useAnimOffscreenRef } from "../utils/runtimeVisibility";

function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  if (ref) ref.current = node;
}

export type BorderBeamSize = "sm" | "md" | "lg";

/** Beam colour: neutral, the amber in-progress hue, or the violet→cyan sweep. */
export type BorderBeamColorVariant = "mono" | "progress" | "colorful";

export type BorderBeamProps = ComponentPropsWithRef<"div"> & {
  children: ReactNode;
  /**
   * Runs the beam while true. Toggle this rather than mounting/unmounting
   * <BorderBeam/> — the wrapper is a real DOM node, so conditional rendering
   * would remount the whole subtree.
   */
  active: boolean;
  size?: BorderBeamSize;
  colorVariant?: BorderBeamColorVariant;
  /**
   * Wrapper classes. Give it the same radius as the child (e.g. `rounded-control`)
   * — the beam inherits the wrapper's radius.
   */
  className?: string;
};

// `beam-*`, not `border-beam-*` — tailwind-merge reads a `border-` prefix as a
// border-colour utility and would drop the base class as a variant conflict.
const sizeClass: Record<BorderBeamSize, string> = {
  sm: "beam-sm",
  md: "",
  lg: "beam-lg",
};

const colorClass: Record<BorderBeamColorVariant, string> = {
  mono: "",
  progress: "beam-progress",
  colorful: "beam-colorful",
};

/**
 * Wraps a surface in a hairline of light that travels around its border while
 * `active`. The child needs an opaque background: it is what hides the
 * gradient's interior so only the ring reads. Beam keyframes live in globals.css.
 *
 * Spreads the rest props and ref onto the wrapper div so the whole thing can
 * sit under a Radix `asChild` trigger (context menus on in-progress cards).
 */
export function BorderBeam({
  children,
  active,
  size = "md",
  colorVariant = "mono",
  className,
  ref,
  ...rest
}: BorderBeamProps) {
  const setOffscreen = useAnimOffscreenRef<HTMLDivElement>();
  return (
    <div
      className={cn("relative", className)}
      ref={(node) => {
        setOffscreen(node);
        assignRef(ref, node);
      }}
      {...rest}
    >
      <AnimatePresence initial={false}>
        {active ? (
          <m.span
            aria-hidden="true"
            data-anim-chrome=""
            className={cn(
              "beam-root",
              sizeClass[size],
              colorClass[colorVariant],
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionSlow}
          >
            <span className="beam" />
          </m.span>
        ) : null}
      </AnimatePresence>
      {children}
    </div>
  );
}
