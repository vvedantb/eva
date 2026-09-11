import { createContext, use } from "react";
import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";

/**
 * The current build step of the active slide. 0 = the slide's resting state,
 * before the presenter has clicked. `UpdatesDeck` provides it; the default of 0
 * means a slide rendered on its own still shows its step-0 content.
 */
export const DeckStepContext = createContext<number>(0);

export function useDeckStep(): number {
  return use(DeckStepContext);
}

/** Decelerating curve, no overshoot — the deck uses this everywhere. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Eva's two brand colours. The deck's gradients and orbs are built from these. */
export const BRAND: { readonly purple: string; readonly blue: string } = {
  purple: "#8B3FB8",
  blue: "#3B7DD8",
};

type RevealFrom = "up" | "down" | "left" | "right" | "none";

function offset(from: RevealFrom, distance: number): { x: number; y: number } {
  switch (from) {
    case "up":
      return { x: 0, y: distance };
    case "down":
      return { x: 0, y: -distance };
    case "left":
      return { x: -distance, y: 0 };
    case "right":
      return { x: distance, y: 0 };
    case "none":
      return { x: 0, y: 0 };
  }
}

interface RevealProps {
  children: ReactNode;
  step?: number;
  delay?: number;
  className?: string;
  from?: RevealFrom;
  distance?: number;
  blur?: boolean;
}

/**
 * Fades and slides its children in once the deck reaches `step`. Children are
 * never unmounted, so measured layout stays stable across the build.
 */
export function Reveal({
  children,
  step = 0,
  delay = 0,
  className,
  from = "up",
  distance = 16,
  blur = true,
}: RevealProps) {
  const visible = useDeckStep() >= step;
  const { x, y } = offset(from, distance);
  const hidden = {
    opacity: 0,
    x,
    y,
    filter: blur ? "blur(8px)" : "blur(0px)",
  };
  const shown = { opacity: 1, x: 0, y: 0, filter: "blur(0px)" };

  return (
    <m.div
      initial={hidden}
      animate={visible ? shown : hidden}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: visible ? delay : 0 }}
      className={className}
    >
      {children}
    </m.div>
  );
}

interface StaggerProps {
  children: ReactNode;
  step?: number;
  delayChildren?: number;
  staggerChildren?: number;
  className?: string;
}

/** Container half of the stagger pair. Wrap each child in `StaggerItem`. */
export function Stagger({
  children,
  step = 0,
  delayChildren = 0.1,
  staggerChildren = 0.08,
  className,
}: StaggerProps) {
  const visible = useDeckStep() >= step;
  return (
    <m.div
      initial="hidden"
      animate={visible ? "show" : "hidden"}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren, delayChildren } },
      }}
      className={className}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      variants={{
        hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)" },
      }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </m.div>
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

export function Kicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 text-[13px] font-medium tracking-[0.22em] text-white/45 uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
        "font-semibold tracking-[-0.02em] text-white",
        "leading-[1.05]",
        sizeClass,
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function Body({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-6 max-w-2xl text-xl leading-relaxed text-white/65",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Brand-gradient text. Use sparingly — one phrase per slide. */
export function Accent({ children }: { children: ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] bg-clip-text text-transparent">
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-white/[0.05] p-6", className)}>
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
        "absolute right-24 bottom-10 left-24 text-xs text-white/35",
        className,
      )}
    >
      {children}
    </div>
  );
}
