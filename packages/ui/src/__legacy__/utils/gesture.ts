/**
 * Gesture physics from Apple's *Designing Fluid Interfaces* (WWDC 2018).
 *
 * These two functions are the whole of it, and both were previously copied
 * verbatim into each surface that needed them. They are pure maths with no
 * React or DOM dependency — import them, do not re-derive them.
 */

/**
 * Progressive resistance past a boundary. A hard stop reads as frozen; damping
 * that grows with the overshoot reads as "responsive, but there is nothing more
 * here". Returns the *damped* overshoot, so callers add it back to the bound:
 *
 * ```ts
 * width < MIN ? MIN - rubberband(MIN - width, MIN) : width
 * ```
 *
 * @param overshoot How far past the bound the pointer is, always positive.
 * @param dimension The span the resistance is measured against — normally the
 *   bound itself, or the container size for a percentage-based drag.
 */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/**
 * Where a flick would come to rest, so a gesture can be animated to where it
 * was *going* rather than to the nearest snap point from where it was released.
 * Add the result to the current position, then pick the snap target nearest
 * that projection.
 *
 * This is the exponential-decay form Apple ships, not the textbook
 * `v² / (2·decel)` — they are not the same curve.
 *
 * @param initialVelocity Release velocity in px/s.
 * @param decelerationRate 0.998 matches normal scroll feel; 0.99 is snappier.
 */
export function projectVelocity(
  initialVelocity: number,
  decelerationRate = 0.998,
): number {
  return (
    ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate)
  );
}

/**
 * Movement in px before a drag commits to a direction. Arming on the first
 * pixel turns sloppy clicks into drags; a hold-to-arm delay makes a fast,
 * decisive drag fail outright. Distance-based activation avoids both.
 */
export const DRAG_ACTIVATION_DISTANCE_PX = 8;
