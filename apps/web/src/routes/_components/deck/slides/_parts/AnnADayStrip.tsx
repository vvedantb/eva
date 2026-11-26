import { m } from "motion/react";
import { Layer } from "../../_components/DeckCamera";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, MaskedText, cueTransition } from "../../_components/motion";
import { MoA1Dot, MoA1Rail } from "./MoA1Rail";

export interface AnnADayMark {
  /** Index into `days`. */
  day: number;
  title: string;
  date: string;
  /** Build step that lands this marker. */
  step: number;
}

/** Design size of the strip: the full content column. */
const TRACK_W = 1088;
const BOX_H = 230;
/** Vertical position of the rail inside the box. */
const RAIL_Y = 172;
/** Keeps the first and last day labels well inside the box. */
const INSET = 96;
/** The rail runs this far in from each edge. */
const RAIL_PAD = 24;
/** Stem length from the rail up to the marker label. */
const STEM = 84;
/** How far the markers sit in front of the rail they mark. */
const DOT_DEPTH = 30;
/** The light travels first; the marker lands as it arrives. */
const LAND = 0.45;

function xFor(index: number, count: number): number {
  return INSET + (index / (count - 1)) * (TRACK_W - INSET * 2);
}

/** Rail fraction under a given x, for the lit run. */
function railAt(x: number): number {
  return (x - RAIL_PAD) / (TRACK_W - RAIL_PAD * 2);
}

function Marker({
  mark,
  count,
  liveStep,
}: {
  mark: AnnADayMark;
  count: number;
  liveStep: number;
}) {
  const on = useDeckStep() >= mark.step;

  return (
    <div
      className="absolute"
      style={{
        left: xFor(mark.day, count),
        top: RAIL_Y,
        transformStyle: "preserve-3d",
      }}
    >
      <Layer depth={DOT_DEPTH}>
        <m.div
          aria-hidden
          className="absolute w-px origin-bottom bg-gradient-to-t from-white/30 to-white/0"
          style={{ height: STEM, top: -STEM }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: on ? 1 : 0 }}
          transition={cueTransition(on, LAND + 0.1, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        />
        <MoA1Dot step={mark.step} delay={LAND} liveStep={liveStep} />

        <div
          className="absolute w-[300px] -translate-x-1/2 text-center"
          style={{ left: 0, bottom: STEM + 4 }}
        >
          <div className="text-3xl leading-tight font-semibold text-white">
            <MaskedText step={mark.step} delay={LAND + 0.2}>
              {mark.title}
            </MaskedText>
          </div>
          <m.div
            className="mt-2 text-sm text-white/45"
            initial={{ opacity: 0, y: 6 }}
            animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={cueTransition(on, LAND + 0.4, {
              duration: DUR.base,
              ease: EASE.out,
            })}
          >
            {mark.date}
          </m.div>
        </div>
      </Layer>
    </div>
  );
}

/**
 * A short calendar rail. It draws in with a tick per day, and a run of brand
 * light waits on the first day. Each build step sends the light on to the next
 * day that mattered, and that day's marker lands as the light arrives. On the
 * last step both markers start to breathe: the ideas are still live.
 */
export function AnnADayStrip({
  days,
  marks,
}: {
  days: readonly string[];
  marks: readonly AnnADayMark[];
}) {
  const stops = [
    railAt(xFor(0, days.length)),
    ...marks.map((mark) => railAt(xFor(mark.day, days.length))),
  ];
  const liveStep = marks.reduce((last, mark) => Math.max(last, mark.step), 0);

  return (
    <div
      className="relative"
      style={{ width: TRACK_W, height: BOX_H, transformStyle: "preserve-3d" }}
    >
      <Layer depth={0}>
        <MoA1Rail
          width={TRACK_W - RAIL_PAD * 2}
          stops={stops}
          left={RAIL_PAD}
          top={RAIL_Y}
          delay={0.3}
        />
      </Layer>

      {days.map((day, index) => (
        <m.div
          key={day}
          className="absolute"
          style={{ left: xFor(index, days.length), top: RAIL_Y }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: DUR.base,
            ease: EASE.out,
            delay: 0.55 + index * 0.1,
          }}
        >
          <span
            aria-hidden
            className="absolute -top-[5px] h-2.5 w-px -translate-x-1/2 bg-white/25"
          />
          <span className="absolute top-5 -translate-x-1/2 text-sm whitespace-nowrap text-white/40">
            {day}
          </span>
        </m.div>
      ))}

      {marks.map((mark) => (
        <Marker
          key={mark.title}
          mark={mark}
          count={days.length}
          liveStep={liveStep}
        />
      ))}
    </div>
  );
}
