"use client";

import type { ReactNode } from "react";
import { m, type Variants } from "motion/react";
import { cn } from "@eva/ui";

const LANDING_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const REVEAL_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: LANDING_EASE },
  },
};

/**
 * Fades a whole section in once as it enters the viewport. Applied per section
 * rather than per card â€” staggering every tile on a page this long reads as
 * noise and costs a subscription per element.
 */
export function LandingReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      variants={REVEAL_VARIANTS}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-64px" }}
    >
      {children}
    </m.div>
  );
}

/** Page section wrapper: anchor target, consistent width and vertical rhythm. */
export function LandingSection({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-28 sm:px-8 sm:py-32 lg:px-10 lg:py-40",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Eyebrow + heading + supporting line, shared by every section on the page. */
export function LandingSectionHeading({
  eyebrow,
  heading,
  intro,
  className,
}: {
  eyebrow: string;
  heading: string;
  intro: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <p className="font-mono text-2xs uppercase tracking-[0.28em] text-primary">
        {eyebrow}
      </p>
      <h2 className="landing-display mt-5 text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl">
        {heading}
      </h2>
      <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
        {intro}
      </p>
    </div>
  );
}

/**
 * Hairline lattice: a border-coloured background showing through 1px grid gaps,
 * so adjacent cells share a single rule instead of stacking two borders. The
 * caller is responsible for a column count that divides its children exactly â€”
 * a ragged final row exposes the background as a solid block.
 */
export function LandingLattice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-hidden rounded-surface border border-border">
      <div className={cn("grid gap-px bg-border", className)}>{children}</div>
    </div>
  );
}
