import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { CountRoll } from "../../_components/motion";
import { AnnABeats } from "../_parts/AnnABeats";
import type { AnnABeat } from "../_parts/AnnABeats";

/** One beat per month, each with the changes shipped in it. */
const BEATS: readonly AnnABeat[] = [
  { heading: 1052, label: "July, the sandbox cutover", accent: true },
  { heading: 877, label: "August, durable turns and security" },
  { heading: 102, label: "September, multi-repo and decision models" },
];

export function AnnualQ3() {
  return (
    <Shell className="py-14">
      <div className="flex items-start justify-between">
        <div>
          <Reveal from="none">
            <Kicker>Origin · Chapter three</Kicker>
          </Reveal>
          <Reveal delay={0.1}>
            <Title size="md">Make it dependable.</Title>
          </Reveal>
        </div>

        <Reveal delay={0.3} className="text-right">
          <div className="text-6xl leading-none font-semibold tabular-nums text-white">
            <CountRoll value={2031} delay={0.35} duration={1.4} />
          </div>
          <div className="mt-4 text-base text-white/50">
            changes shipped, July to September
          </div>
        </Reveal>
      </div>

      <AnnABeats beats={BEATS} firstStep={1} liveLast className="mt-40" />

      <Footnote>
        Changes shipped July to September 2026. September runs to the 16th.
      </Footnote>
    </Shell>
  );
}
