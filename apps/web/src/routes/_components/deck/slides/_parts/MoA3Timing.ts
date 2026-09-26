/**
 * When a move on the deck's in-out curve (`EASE.inOut`) reaches `progress`,
 * as a fraction of its duration. A close approximation of the inverse, good
 * enough to land a tick as a sweeping beam passes it.
 */
export function moA3InOutAt(progress: number): number {
  return progress < 0.5
    ? Math.sqrt(progress / 2)
    : 1 - Math.sqrt((1 - progress) / 2);
}
