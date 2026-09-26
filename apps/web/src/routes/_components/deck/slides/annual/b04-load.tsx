import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";
import { AnnAShrinkBars } from "../_parts/AnnAShrinkBars";
import type { AnnAShrinkRow } from "../_parts/AnnAShrinkBars";

/** Before and after, in kilobytes, from the end of March. */
const ROWS: readonly AnnAShrinkRow[] = [
  { label: "The main bundle", from: 1355, to: 273, drop: 80 },
  { label: "The heaviest screen", from: 1048, to: 84, drop: 92 },
];

export function AnnualLoad() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Reveal from="none">
        <Kicker>Origin · March 2026</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="md">Then make it load.</Title>
      </Reveal>

      <AnnAShrinkBars rows={ROWS} active={step >= 1} className="mt-16" />

      <p className="mt-16 max-w-4xl text-3xl leading-snug text-balance text-white/85">
        <MaskedText step={2} delay={0.1}>
          Opening the app now downloads <Accent>a fifth as much</Accent>.
        </MaskedText>
      </p>

      <Footnote>Bundle optimisation, 31 March 2026.</Footnote>
    </Shell>
  );
}
