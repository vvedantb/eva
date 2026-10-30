import { Reveal, Shell, Title } from "../../_components/DeckPrimitives";
import { AnnABeats } from "../_parts/AnnABeats";
import type { AnnABeat } from "../_parts/AnnABeats";

/** One beat per group of features, in the order they shipped. */
const BEATS: readonly AnnABeat[] = [
  { heading: "Comments, suggestions, history", label: "Documents, 10 June" },
  { heading: "The projects roadmap", label: "Projects, 17 June" },
  { heading: "Testing Arena for everyone", label: "Testing, 17 June" },
];

export function AnnualQ2() {
  return (
    <Shell className="py-14">
      <div className="flex items-start justify-between">
        <div>
          <Reveal delay={0.1}>
            <Title size="md">Work together</Title>
          </Reveal>
        </div>
      </div>

      <AnnABeats beats={BEATS} firstStep={1} className="mt-40" />
    </Shell>
  );
}
