import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  cueTransition,
} from "../../_components/motion";
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

/** Inset geometry. March is the tallest, so its top sits under the value row. */
const COL_W = 104;
const GAP = 26;
const BAR_MAX = 180;
const CHART_W = Q1.length * COL_W + (Q1.length - 1) * GAP;
/** Value row (20px) plus its 8px gap: the top of March's column. */
const MARCH_TOP = 28;

/** A short leader from March's top out to its caption. */
function MarchCallout() {
  const on = useDeckStep() >= 2;
  return (
    <div
      className="absolute flex items-center"
      style={{ left: CHART_W + 10, top: MARCH_TOP - 10 }}
    >
      <m.span
        aria-hidden
        className="h-px w-8 origin-left bg-white/35"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: on ? 1 : 0 }}
        transition={cueTransition(on, 1.05, {
          duration: DUR.base,
          ease: EASE.expo,
        })}
      />
      <span className="ml-3 text-sm whitespace-nowrap text-white/70">
        <MaskedText step={2} delay={1.2} stagger={0.04}>
          The biggest month of the year
        </MaskedText>
      </span>
    </div>
  );
}

export function AnnualQ1() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <Reveal from="none">
        <Kicker>Origin · Chapter one</Kicker>
      </Reveal>
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

        <div className="relative">
          <AnnABarChart
            bars={Q1}
            colWidth={COL_W}
            gap={GAP}
            barMax={BAR_MAX}
            step={2}
            focus={MARCH}
            focused={step >= 2}
            sheenStep={2}
          />
          <MarchCallout />
        </div>
      </div>

      <MoA1WriteDrop step={3} className="mt-14" />

      <Footnote>
        Changes shipped January to March 2026. Live streaming moved to its own
        table on 5 February 2026.
      </Footnote>
    </Shell>
  );
}
