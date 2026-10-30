import { CountUp } from "../CountUp";
import type { CountUpProps } from "../CountUp";

/**
 * An odometer counter: `CountUp` with `roll` on. Each digit column spins up to
 * its value, rightmost first. Inside an `Accent`, each column paints its own
 * slice of the gradient, so the number still reads as one gradient.
 *
 * @example <CountRoll value={4732} step={2} className="text-7xl font-semibold" />
 */
export function CountRoll(props: Omit<CountUpProps, "roll">) {
  return <CountUp {...props} roll />;
}
