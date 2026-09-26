import type { Transition } from "motion/react";

/**
 * The deck's motion vocabulary. Every primitive and every slide draws from
 * these, so the whole deck moves with one hand. See `README.md` for when to
 * reach for which.
 */

type Bezier = [number, number, number, number];

/** Decelerating curve, no overshoot — the deck's everyday ease. */
export const EASE_OUT: Bezier = [0.22, 1, 0.36, 1];

export const EASE: {
  readonly out: Bezier;
  readonly expo: Bezier;
  readonly inOut: Bezier;
  readonly in: Bezier;
} = {
  /** Everyday entrances: cards, chips, rows. */
  out: EASE_OUT,
  /** Long, film-like deceleration for hero moves: titles, masks, big numbers. */
  expo: [0.16, 1, 0.3, 1],
  /** Things that travel across and leave: sheens, washes, camera pans. */
  inOut: [0.65, 0, 0.35, 1],
  /** Exits: quick to get going, then gone. */
  in: [0.5, 0, 0.75, 0],
};

/** Seconds. Pick by the size of the thing moving, not by taste. */
export const DUR: {
  readonly fast: number;
  readonly base: number;
  readonly slow: number;
  readonly hero: number;
} = {
  /** Exits, dims, colour changes. */
  fast: 0.18,
  /** Small elements: chips, labels, icons. */
  base: 0.35,
  /** Cards, rows, panels. */
  slow: 0.6,
  /** Hero moves: titles, statements, the one thing on the step. */
  hero: 0.9,
};

/** Seconds between siblings. */
export const STAGGER: {
  readonly char: number;
  readonly word: number;
  readonly item: number;
  readonly block: number;
} = {
  /** Characters inside a hero word. */
  char: 0.028,
  /** Words inside a title or statement. */
  word: 0.07,
  /** Items in a list or grid. */
  item: 0.08,
  /** Big blocks: panels, columns. */
  block: 0.14,
};

/** Eva's two brand colours. The deck's gradients and orbs are built from these. */
export const BRAND: { readonly purple: string; readonly blue: string } = {
  purple: "#8B3FB8",
  blue: "#3B7DD8",
};

export const BRAND_GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;

/** Hero entrance: long expo tween. */
export const HERO: Transition = { duration: DUR.hero, ease: EASE.expo };

/** Settle: critically damped spring, for anything that lands in place. */
export const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.6 };

/** Leaving is quieter than arriving: short, no delay. */
export const LEAVE: Transition = { duration: DUR.fast, ease: EASE.out };

/** Enter on `on` with the given delay, leave instantly otherwise. */
export function cueTransition(
  on: boolean,
  delay: number,
  enter: Transition = HERO,
): Transition {
  return on ? { ...enter, delay } : LEAVE;
}
