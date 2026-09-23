import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { AnnABarChart } from "../_parts/AnnABarChart";
import type { AnnABar } from "../_parts/AnnABarChart";

/** A shallow three-quarter view gives the columns body, then it squares up. */
const VOLUME_SHOTS: readonly CameraShot[] = [
  { rotateY: -7, rotateX: 4, translateZ: -20 },
  { rotateY: -3, rotateX: 2 },
  {},
];

/** Changes shipped per calendar month. September is a part month. */
const MONTHS: readonly AnnABar[] = [
  { label: "Jan", value: 280 },
  { label: "Feb", value: 408 },
  { label: "Mar", value: 1070 },
  { label: "Apr", value: 377 },
  { label: "May", value: 336 },
  { label: "Jun", value: 230 },
  { label: "Jul", value: 1052 },
  { label: "Aug", value: 877 },
  { label: "Sep", value: 139 },
];

/** March and July, the two peaks. */
const PEAKS = [2, 6];

export function AnnualVolume() {
  const step = useDeckStep();

  return (
    <Shell className="py-14">
      <div className="flex items-start justify-between">
        <div>
          <Reveal from="none">
            <Kicker>The shape of the year</Kicker>
          </Reveal>
          <Reveal delay={0.1}>
            <Title size="md">It did not arrive evenly.</Title>
          </Reveal>
        </div>

        <Reveal step={2} delay={0.1} className="text-right">
          <div className="text-7xl leading-none font-semibold tabular-nums">
            <Accent>
              <CountUp value={4769} step={2} delay={0.2} />
            </Accent>
          </div>
          <div className="mt-4 text-base text-white/50">
            changes shipped in all
          </div>
        </Reveal>
      </div>

      <Camera shots={VOLUME_SHOTS} className="mt-10">
        <AnnABarChart
          bars={MONTHS}
          colWidth={92}
          gap={18}
          barMax={230}
          delay={0.3}
          focus={PEAKS}
          focused={step >= 1}
        />
      </Camera>

      <Reveal step={1} delay={0.25} className="mt-7">
        <p className="text-2xl leading-snug text-pretty text-white/85">
          March built the surface. July moved the work to the cloud.
        </p>
      </Reveal>

      <Footnote>
        Changes shipped per calendar month. September is a part month.
      </Footnote>
    </Shell>
  );
}
