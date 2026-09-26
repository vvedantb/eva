import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useMotionCue } from "./deckContext";
import { MaskedText } from "./motion/MaskedText";
import { BRAND_GRADIENT, DUR, EASE, cueTransition } from "./motion/tokens";

/** Resting kicker tracking. The text tracks in from `KICKER_TRACK_FROM`. */
const KICKER_TRACK = "0.22em";
const KICKER_TRACK_FROM = "0.6em";

/**
 * The small uppercase line above a title. A short brand rule draws in from the
 * left, hanging in the gutter so the text still aligns with the title, then the
 * text tracks in from wide spacing to its resting value.
 */
export function Kicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { on, delay } = useMotionCue();

  return (
    <div
      className={cn(
        "relative mb-5 text-[13px] font-medium tracking-[0.22em] text-white/45 uppercase",
        className,
      )}
    >
      <m.span
        aria-hidden
        className="absolute top-1/2 right-full mr-4 h-px w-8 origin-left rounded-full"
        style={{ background: BRAND_GRADIENT }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={on ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
        transition={cueTransition(on, delay, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      />
      <m.span
        className="inline-block"
        initial={{ opacity: 0, letterSpacing: KICKER_TRACK_FROM }}
        animate={{
          opacity: on ? 1 : 0,
          letterSpacing: on ? KICKER_TRACK : KICKER_TRACK_FROM,
        }}
        transition={cueTransition(on, delay + 0.12, {
          duration: 1.1,
          ease: EASE.expo,
        })}
      >
        {children}
      </m.span>
    </div>
  );
}

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
        // Prose gets `pretty`, not `balance`: orphans go, the rest holds still.
        "mt-6 max-w-2xl text-xl leading-relaxed text-pretty text-white/65",
        className,
      )}
    >
      {children}
    </p>
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
