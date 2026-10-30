import type { Icon } from "@tabler/icons-react";
import {
  IconHourglass,
  IconLoader2,
  IconShieldLock,
  IconUnlink,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, Pulse, cueTransition } from "../../_components/motion";
import { Fri2Chip } from "./Fri2Chip";
import { fri3X } from "./Fri3LimitsLadder";

interface Problem {
  icon: Icon;
  label: string;
  /** First and latest mention in Eva's changelog. */
  first: string;
  latest: string;
}

const PROBLEMS: readonly Problem[] = [
  {
    icon: IconUnlink,
    label: "Loses the thread",
    first: "2026-02-26",
    latest: "2026-08-28",
  },
  {
    icon: IconLoader2,
    label: "Gets stuck",
    first: "2026-03-03",
    latest: "2026-09-21",
  },
  {
    icon: IconShieldLock,
    label: "Needs a human guard",
    first: "2026-03-04",
    latest: "2026-09-02",
  },
  {
    icon: IconHourglass,
    label: "Waits for review",
    first: "2026-04-28",
    latest: "2026-09-11",
  },
];

/** Warm, so the problems never read as part of the brand line above them. */
const WARM = "#fbbf24";
export const FRI3_LANE_GAP = 48;
export const FRI3_LANES_H = PROBLEMS.length * FRI3_LANE_GAP;
const SHOW = 2;

function Lane({ problem, index }: { problem: Problem; index: number }) {
  const on = useDeckStep() >= SHOW;
  const left = fri3X(problem.first);
  const right = fri3X(problem.latest);
  const y = index * FRI3_LANE_GAP + FRI3_LANE_GAP / 2;
  const at = 0.3 + index * 0.12;

  return (
    <div className="absolute inset-x-0" style={{ top: y }}>
      <m.div
        className="absolute left-0 -translate-y-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: on ? 1 : 0 }}
        transition={cueTransition(on, at - 0.2, { duration: DUR.base })}
      >
        <Fri2Chip
          icon={problem.icon}
          label={problem.label}
          lit={on}
          delay={at}
        />
      </m.div>

      <m.span
        aria-hidden
        className="absolute h-1.5 origin-left -translate-y-1/2 rounded-full"
        style={{
          left,
          width: right - left,
          background: `linear-gradient(90deg, ${WARM}55, ${WARM})`,
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: on ? 1 : 0 }}
        transition={cueTransition(on, at + 0.15, {
          duration: 1.5,
          ease: EASE.expo,
        })}
      />
      <m.span
        aria-hidden
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left, background: WARM }}
        initial={{ opacity: 0 }}
        animate={{ opacity: on ? 0.6 : 0 }}
        transition={cueTransition(on, at + 0.15, { duration: DUR.base })}
      />
      {/* Still being written about at the right-hand end. */}
      <m.span
        className="absolute flex -translate-x-1/2 -translate-y-1/2"
        style={{ left: right }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
        transition={cueTransition(on, at + 1.1, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      >
        <Pulse color={WARM} size={10} rings={1} step={SHOW} delay={at + 1.3} />
      </m.span>
    </div>
  );
}

/** The same problems, first mention to latest, lit across the whole year. */
export function Fri3LimitsLanes({ top }: { top: number }) {
  return (
    <div className="absolute inset-x-0" style={{ top, height: FRI3_LANES_H }}>
      {PROBLEMS.map((problem, index) => (
        <Lane key={problem.label} problem={problem} index={index} />
      ))}
    </div>
  );
}
