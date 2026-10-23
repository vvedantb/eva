import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import { MaskedText } from "./motion/MaskedText";

/**
 * The slide heading. Each word rises from behind its own mask (see
 * `MaskedText`); an `Accent` phrase inside is split with its gradient kept
 * whole. Inside a `Reveal`, the words wait for that reveal's step and delay.
 */
export function Title({
  children,
  size = "lg",
  className,
}: {
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeClass =
    size === "md" ? "text-5xl" : size === "xl" ? "text-7xl" : "text-6xl";
  return (
    <h1
      className={cn(
        // Balanced: a two-line title on a 1280px stage should not strand one
        // word on the second line. The masks leave the spaces as real text,
        // so balancing sees the same string it always did.
        "font-semibold tracking-[-0.02em] text-balance text-white",
        "leading-[1.05]",
        sizeClass,
        className,
      )}
    >
      <MaskedText>{children}</MaskedText>
    </h1>
  );
}

/** The standard slide frame: full bleed, generous gutters. */
export function Shell({
  children,
  className,
  center = false,
}: {
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col px-24 py-20",
        center && "items-center justify-center text-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Footnote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute right-24 bottom-10 left-24 text-xs text-pretty text-white/35",
        className,
      )}
    >
      {children}
    </div>
  );
}
