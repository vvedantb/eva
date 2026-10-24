import type { Transition } from "motion/react";

/**
 * The house motion tokens, in the form `motion/react` wants them.
 *
 * `globals.css` defines `--motion-fast` / `--motion-base` / `--motion-slow` and
 * `--motion-ease-out`, and every CSS transition in the app resolves to them. The
 * JS side had no equivalent, so 42 `transition={{ … }}` props carried raw numbers
 * and drifted: seven distinct durations (0.15 through 0.35) and five different
 * eases for the same job — `motion`'s implicit default, a hand-copied
 * `[0.22, 1, 0.36, 1]`, `"easeOut"`, `"linear"`, and two ad-hoc springs. A row
 * fading in beside a row sliding in eased differently for no reason.
 *
 * Durations are seconds here and milliseconds in CSS; the numbers below are the
 * same values. If a token changes in `globals.css`, change it here too.
 */

/** `--motion-ease-out`. Decelerating, no overshoot. */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** `--motion-fast` — 150ms. Hover, focus, small reveals. */
export const motionFast: Transition = { duration: 0.15, ease: EASE_OUT };

/** `--motion-base` — 220ms. The default for anything entering or leaving. */
export const motionBase: Transition = { duration: 0.22, ease: EASE_OUT };

/** `--motion-slow` — 320ms. Large surfaces and staggered page content. */
export const motionSlow: Transition = { duration: 0.32, ease: EASE_OUT };

/**
 * Critically damped spring, no overshoot — the default for anything the user can
 * touch, because a spring re-targets from its current value and velocity instead
 * of restarting. Bounce stays at 0: overshoot belongs to motion the user's own
 * gesture put there, and none of these are gesture-driven.
 */
export const motionSpring: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.35,
};

/**
 * A stagger step for list entrances, capped so a long list does not make the last
 * row wait. Use as `delay: motionStagger(index)`.
 */
export function motionStagger(index: number, step = 0.03, max = 0.2): number {
  return Math.min(index * step, max);
}
