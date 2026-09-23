import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { AnnADayStrip } from "../_parts/AnnADayStrip";
import type { AnnADayMark } from "../_parts/AnnADayStrip";

/**
 * The camera leans towards each marker as it lands, then squares up for the
 * closing line. The angles stay shallow because the day labels are 14px.
 */
const WEEK_SHOTS: readonly CameraShot[] = [
  { rotateX: 5, translateZ: -40 },
  { rotateY: 5, rotateX: 3, x: 30 },
  {},
];

const DAYS: readonly string[] = ["11 Jan", "12 Jan", "13 Jan", "14 Jan"];

const MARKS: readonly AnnADayMark[] = [
  { day: 1, title: "Quick tasks", date: "12 January 2026", step: 1 },
  { day: 3, title: "Sessions", date: "14 January 2026", step: 2 },
];

export function AnnualFirstWeek() {
  return (
    <Shell className="py-14">
      <Reveal from="none">
        <Kicker>Week one</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="md">Four days set the shape.</Title>
      </Reveal>

      <Camera shots={WEEK_SHOTS} className="mt-14">
        <AnnADayStrip days={DAYS} marks={MARKS} />
      </Camera>

      <Reveal step={2} delay={0.35} className="mt-12">
        <p className="text-3xl leading-snug text-balance text-white/85">
          The product still rests on <Accent>these two ideas</Accent>.
        </p>
      </Reveal>

      <Footnote>Dates from the project&rsquo;s own history.</Footnote>
    </Shell>
  );
}
