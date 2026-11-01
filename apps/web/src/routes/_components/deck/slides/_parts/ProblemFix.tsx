import { IconArrowRight } from "@tabler/icons-react";
import { Reveal } from "../../_components/DeckPrimitives";

const LABEL = "text-sm font-semibold tracking-[0.14em] text-white/45 uppercase";

/**
 * One line under a title saying what was wrong and what changed, so a
 * mechanism slide reads as a story before its diagram plays.
 */
export function ProblemFix({
  problem,
  fix,
  className,
}: {
  problem: string;
  fix: string;
  className?: string;
}) {
  return (
    <Reveal delay={0.25} className={className}>
      <div className="mt-5 flex items-center gap-4 text-xl text-white/85">
        <span className={LABEL}>Problem</span>
        <span>{problem}</span>
        <IconArrowRight size={20} className="text-white/40" aria-hidden />
        <span className={LABEL}>Fix</span>
        <span>{fix}</span>
      </div>
    </Reveal>
  );
}
