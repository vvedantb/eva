import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { AnnABeats } from "../_parts/AnnABeats";
import type { AnnABeat } from "../_parts/AnnABeats";

/** One beat per group of features, in the order they shipped. */
const BEATS: readonly AnnABeat[] = [
  { heading: "Comments, suggestions, history", label: "Documents, 10 June" },
  { heading: "The projects roadmap", label: "17 June" },
  { heading: "Testing Arena for everyone", label: "17 June" },
];

export function AnnualQ2() {
  return (
    <Shell className="py-14">
      <div className="flex items-start justify-between">
        <div>
          <Reveal from="none">
            <Kicker>Chapter two</Kicker>
          </Reveal>
          <Reveal delay={0.1}>
            <Title size="md">Work together.</Title>
          </Reveal>
        </div>

        <Reveal delay={0.3} className="text-right">
          <div className="text-6xl leading-none font-semibold tabular-nums text-white">
            <CountUp value={943} delay={0.4} />
          </div>
          <div className="mt-4 text-base text-white/50">
            changes shipped, April to June
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.25}>
        <Body className="max-w-3xl text-2xl">
          The quietest quarter was a <Accent>consolidation</Accent> quarter.
        </Body>
      </Reveal>

      <AnnABeats beats={BEATS} firstStep={1} className="mt-36" />

      <Footnote>
        Changes shipped April to June 2026. Documents 10 June 2026; roadmap and
        Testing Arena 17 June 2026.
      </Footnote>
    </Shell>
  );
}
