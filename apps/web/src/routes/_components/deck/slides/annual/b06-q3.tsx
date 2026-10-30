import { Reveal, Shell, Title } from "../../_components/DeckPrimitives";
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
          <Reveal delay={0.1}>
            <Title size="md">Make it dependable</Title>
          </Reveal>
        </div>
      </div>

      <AnnABeats beats={BEATS} firstStep={1} liveLast className="mt-40" />
    </Shell>
  );
}
