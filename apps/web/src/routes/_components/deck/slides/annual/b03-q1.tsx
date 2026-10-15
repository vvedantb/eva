import {
  Accent,
  Footnote,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { CountRoll, MaskedText } from "../../_components/motion";
import { AnnABarChart } from "../_parts/AnnABarChart";
import type { AnnABar } from "../_parts/AnnABarChart";
import { MoA1WriteDrop } from "../_parts/MoA1WriteDrop";

/** Changes shipped in the first quarter, month by month. */
const Q1: readonly AnnABar[] = [
  { label: "Jan", value: 280 },
  { label: "Feb", value: 408 },
  { label: "Mar", value: 1070 },
];

/** March is the column the chart exists to point at. */
const MARCH = [2];

export function AnnualQ1() {
  const step = useDeckStep();

  return (
    <Shell className="justify-center py-14">
      <Reveal delay={0.1}>
        <Title size="md">Build the surface.</Title>
      </Reveal>

      <div className="mt-12 flex items-end gap-24">
        <div>
          <Reveal step={1} distance={24}>
            <div className="text-8xl leading-none font-semibold tracking-[-0.02em]">
              <Accent>
                <CountRoll value={1758} step={1} delay={0.05} duration={1.5} />
              </Accent>
            </div>
          </Reveal>
          <div className="mt-5 text-lg text-white/50">
            <MaskedText step={1} delay={0.45} stagger={0.05}>
              changes shipped, January to March
            </MaskedText>
          </div>
        </div>

        <AnnABarChart
          bars={Q1}
          colWidth={104}
          gap={26}
          barMax={180}
          step={2}
          focus={MARCH}
          focused={step >= 2}
          sheenStep={2}
        />
      </div>

      <MoA1WriteDrop step={3} className="mt-14" />

      <Footnote>
        Changes shipped January to March 2026. Live streaming moved to its own
        table on 5 February 2026.
      </Footnote>
    </Shell>
  );
}
