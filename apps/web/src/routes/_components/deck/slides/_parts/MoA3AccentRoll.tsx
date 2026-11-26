import { InAccentContext } from "../../_components/DeckAccent";
import type { CountUpProps } from "../../_components/CountUp";
import { CountRoll } from "../../_components/motion";

/**
 * A gradient odometer. Each rolling column paints its own slice of the brand
 * gradient. Wrapping `CountRoll` in `Accent` instead would also paint the
 * gradient behind the resting glyphs, because `background-clip: text` clips to
 * every descendant glyph whatever its opacity — so "0" showed before the step.
 */
export function MoA3AccentRoll(props: Omit<CountUpProps, "roll">) {
  return (
    <InAccentContext value>
      <CountRoll {...props} />
    </InAccentContext>
  );
}
