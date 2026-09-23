import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { AnnABarChart } from "../_parts/AnnABarChart";
import type { AnnABar } from "../_parts/AnnABarChart";

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
    <Shell className="py-14">
      <Reveal from="none">
        <Kicker>Chapter one</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="md">Build the surface.</Title>
      </Reveal>

      <div className="mt-12 flex items-end gap-24">
        <Reveal step={1}>
          <div className="text-8xl leading-none font-semibold tracking-[-0.02em]">
            <Accent>
              <CountUp value={1758} step={1} delay={0.15} />
            </Accent>
          </div>
          <div className="mt-5 text-lg text-white/50">
            changes shipped, January to March
          </div>
        </Reveal>

        <div>
          <m.div
            className="mb-3 text-sm text-white/70"
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: step >= 2 ? 1 : 0,
              y: step >= 2 ? 0 : 8,
            }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.5 }}
          >
            The biggest month of the year
          </m.div>
          <AnnABarChart
            bars={Q1}
            colWidth={80}
            gap={20}
            barMax={150}
            active={step >= 2}
            focus={MARCH}
            focused={step >= 2}
          />
        </div>
      </div>

      <Reveal step={3} className="mt-14">
        <div className="flex items-baseline gap-7">
          <span className="text-5xl leading-none tabular-nums text-white/30">
            60&ndash;120
          </span>
          <span className="text-3xl text-white/25">&rarr;</span>
          <m.span
            className="text-6xl leading-none font-semibold text-white"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={
              step >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }
            }
            transition={
              step >= 3
                ? { type: "spring", bounce: 0.2, duration: 0.6, delay: 0.35 }
                : { duration: 0.2, ease: EASE_OUT }
            }
          >
            2
          </m.span>
          <span className="ml-5 text-lg text-white/50">
            writes during a run
          </span>
        </div>
      </Reveal>

      <Footnote>
        Changes shipped January to March 2026. Live streaming moved to its own
        table on 5 February 2026.
      </Footnote>
    </Shell>
  );
}
