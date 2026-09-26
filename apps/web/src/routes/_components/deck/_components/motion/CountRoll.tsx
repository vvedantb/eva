import { CountUp } from "../CountUp";
import type { CountUpProps } from "../CountUp";

/**
 * An odometer counter: `CountUp` with `roll` on. Each digit column spins up to
 * its value, rightmost first. Inside an `Accent`, pass a solid `className`
 * colour instead — gradient text cannot clip moving digit columns.
 *
 * @example <CountRoll value={4732} step={2} className="text-7xl font-semibold" />
 */
export function CountRoll(props: Omit<CountUpProps, "roll">) {
  return <CountUp {...props} roll />;
}
