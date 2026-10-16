"use client";

import type { ReactNode } from "react";
import { m, type Variants } from "motion/react";
import { cn } from "@eva/ui";
import { LANDING_HERO } from "./landingContent";

export const LANDING_EASE: [number, number, number, number] = [
  0.22, 1, 0.36, 1,
];

/**
 * Tone-only card used by every grid on the page. Hierarchy comes from the
 * surface step, not a hairline, per `docs/eva-ui.md`.
 */
export const LANDING_CARD = "rounded-surface bg-card";

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
 * rather than per card — staggering every tile on a page this long reads as
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
        "mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24 lg:px-10 lg:py-28",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Small label above a section heading: a primary tick, then the text. */
export function LandingEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 font-mono text-xs text-muted-foreground">
      <span aria-hidden className="h-px w-6 bg-primary" />
      {children}
    </p>
  );
}

/**
 * Eyebrow + heading + supporting line, shared by every section on the page.
 * `split` puts the intro in a second column on wide screens, bottom-aligned
 * with the heading, so long sections open with an editorial, asymmetric line.
 */
export function LandingSectionHeading({
  eyebrow,
  heading,
  intro,
  split = false,
  className,
}: {
  eyebrow: ReactNode;
  heading: string;
  intro: string;
  split?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        split
          ? "grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end lg:gap-16"
          : "max-w-2xl",
        className,
      )}
    >
      <div>
        <LandingEyebrow>{eyebrow}</LandingEyebrow>
        <h2 className="landing-display mt-5 text-balance text-4xl font-semibold leading-[1.02] text-foreground sm:text-5xl">
          {heading}
        </h2>
      </div>
      <p
        className={cn(
          "max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg",
          !split && "mt-5",
        )}
      >
        {intro}
      </p>
    </div>
  );
}

/**
 * The hero headline, shared by both landing pages. The second half fades from
 * the foreground towards the muted tone, so the line reads as one statement
 * with a stressed ending rather than two flat lines.
 */
export function LandingHeadline({ className }: { className?: string }) {
  return (
    <h1
      className={cn(
        "landing-display text-balance text-5xl font-semibold leading-[0.98] text-foreground sm:text-6xl lg:text-7xl",
        className,
      )}
    >
      {LANDING_HERO.headlineLead}{" "}
      <span className="landing-headline-tail">{LANDING_HERO.headlineTail}</span>
    </h1>
  );
}

/**
 * Capabilities as one quiet mono line rather than a row of pills. Every item
 * carries its own dot, so a wrapped line never starts with a stray separator.
 */
export function LandingCapabilityLine({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-muted-foreground",
        className,
      )}
    >
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2">
          <span aria-hidden className="size-1 rounded-full bg-primary/50" />
          {item}
        </li>
      ))}
    </ul>
  );
}
