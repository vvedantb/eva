import { m } from "motion/react";
import { cn } from "@eva/ui";
import { Accent, Reveal, useDeckStep } from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  cueTransition,
} from "../../_components/motion";
import { MoA1Dot, MoA1Rail } from "./MoA1Rail";

export interface AnnABeat {
  /** A number rolls itself up; a phrase rises into place. */
  heading: string | number;
  label: string;
  /** At most one beat per slide takes the brand gradient. */
  accent?: boolean;
}

interface AnnABeatsProps {
  beats: readonly AnnABeat[];
  /** Build step that reveals the first beat. Each later beat waits one more. */
  firstStep?: number;
  /** Keep the last beat's node breathing: it is still running. */
  liveLast?: boolean;
  className?: string;
}

/** The content column the beats span, and the grid inside it. */
const TRACK_W = 1088;
const COLS = 3;
const COL_GAP = 40;
const COL_W = (TRACK_W - COL_GAP * (COLS - 1)) / COLS;
/** Nodes sit just inside each column's left edge, over the heading. */
const NODE_INSET = 6;
/** The light travels first; the beat lands as it arrives. */
const LAND = 0.4;

function nodeX(index: number): number {
  return index * (COL_W + COL_GAP) + NODE_INSET;
}

function Heading({
  beat,
  step,
  peak,
}: {
  beat: AnnABeat;
  step: number;
  peak: number;
}) {
  const on = useDeckStep() >= step;

  if (typeof beat.heading === "number") {
    const roll = (
      <CountRoll value={beat.heading} step={step} delay={LAND} duration={1.3} />
    );
    return (
      <div>
        <Reveal step={step} delay={LAND - 0.1} distance={20}>
          <div className="text-6xl leading-none font-semibold tabular-nums text-white">
            {beat.accent ? <Accent>{roll}</Accent> : roll}
          </div>
        </Reveal>
        {/* The month's share of the quarter, drawn to scale. */}
        <m.div
          className="mt-5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]"
          initial={{ opacity: 0 }}
          animate={{ opacity: on ? 1 : 0 }}
          transition={cueTransition(on, LAND, {
            duration: DUR.base,
            ease: EASE.out,
          })}
        >
          <m.div
            className="h-full origin-left rounded-full"
            style={{
              width: `${(beat.heading / peak) * 100}%`,
              background: beat.accent
                ? BRAND_GRADIENT
                : "rgba(255,255,255,0.4)",
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: on ? 1 : 0 }}
            transition={cueTransition(on, LAND + 0.15, {
              duration: 1.3,
              ease: EASE.expo,
            })}
          />
        </m.div>
      </div>
    );
  }

  // Fixed height so a one-line heading keeps its label on the same baseline as
  // the two-line headings beside it.
  return (
    <div className="min-h-[76px] text-3xl leading-tight font-semibold text-balance text-white">
      <MaskedText step={step} delay={LAND}>
        {beat.accent ? <Accent>{beat.heading}</Accent> : beat.heading}
      </MaskedText>
    </div>
  );
}

/**
 * Three beats along one rail, one per build step. Each step sends a light
 * along the rail to the next node; the node lands with a ring as it arrives,
 * then the heading rises and the label follows. Used by the two quarter
 * slides so a month of work and a group of features read alike.
 */
export function AnnABeats({
  beats,
  firstStep = 1,
  liveLast = false,
  className,
}: AnnABeatsProps) {
  const peak = beats.reduce(
    (high, beat) =>
      typeof beat.heading === "number" ? Math.max(high, beat.heading) : high,
    1,
  );
  const stops = [
    ...Array.from({ length: firstStep }, () => 0),
    ...beats.map((_, index) => nodeX(index) / TRACK_W),
  ];

  return (
    <div className={cn("relative", className)} style={{ width: TRACK_W }}>
      <MoA1Rail width={TRACK_W} stops={stops} delay={0.5} />

      <div
        className="grid pt-10"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          columnGap: COL_GAP,
        }}
      >
        {beats.map((beat, index) => {
          const step = firstStep + index;
          const last = index === beats.length - 1;
          return (
            <div key={beat.label} className="relative">
              <MoA1Dot
                step={step}
                delay={LAND - 0.05}
                liveStep={liveLast && last ? step : undefined}
                // On the rail (40px up), just inside the column edge.
                className="-top-10 left-1.5"
              />
              <Heading beat={beat} step={step} peak={peak} />
              <div className="mt-4 text-base text-white/50">
                <MaskedText step={step} delay={LAND + 0.25} stagger={0.04}>
                  {beat.label}
                </MaskedText>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
