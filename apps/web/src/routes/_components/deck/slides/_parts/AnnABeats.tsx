import { CountUp } from "../../_components/CountUp";
import { Accent, Reveal } from "../../_components/DeckPrimitives";

export interface AnnABeat {
  /** A number counts itself up; a phrase simply lands. */
  heading: string | number;
  label: string;
  /** At most one beat per slide takes the brand gradient. */
  accent?: boolean;
}

interface AnnABeatsProps {
  beats: readonly AnnABeat[];
  /** Build step that reveals the first beat. Each later beat waits one more. */
  firstStep?: number;
  className?: string;
}

function Heading({ beat, step }: { beat: AnnABeat; step: number }) {
  if (typeof beat.heading === "number") {
    const count = <CountUp value={beat.heading} step={step} delay={0.15} />;
    return (
      <div className="text-6xl leading-none font-semibold tabular-nums text-white">
        {beat.accent ? <Accent>{count}</Accent> : count}
      </div>
    );
  }
  // Fixed height so a one-line heading keeps its label on the same baseline as
  // the two-line headings beside it.
  return (
    <div className="flex min-h-[76px] items-start text-3xl leading-tight font-semibold text-balance text-white">
      {beat.accent ? <Accent>{beat.heading}</Accent> : beat.heading}
    </div>
  );
}

/**
 * Three beats laid out in a row, one arriving per build step. Used by the two
 * quarter slides so a month of work and a group of features read alike.
 */
export function AnnABeats({ beats, firstStep = 1, className }: AnnABeatsProps) {
  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-10">
        {beats.map((beat, index) => {
          const step = firstStep + index;
          return (
            <Reveal key={beat.label} step={step} delay={0.1}>
              <Heading beat={beat} step={step} />
              <div className="mt-4 text-base text-white/50">{beat.label}</div>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
