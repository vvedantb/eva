import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera, Layer } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  CountRoll,
  GridBackdrop,
  MaskedText,
  Sheen,
} from "../../_components/motion";
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
  { label: "Sep", value: 102 },
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
            <Kicker>Origin · The shape of the year</Kicker>
          </Reveal>
          <Reveal delay={0.1}>
            <Title size="md">It did not arrive evenly.</Title>
          </Reveal>
        </div>

        <div className="text-right">
          <Reveal step={2} distance={24}>
            <Sheen delay={0.9} className="-mx-2 px-2">
              <div className="text-7xl leading-none font-semibold tabular-nums">
                <Accent>
                  <CountRoll value={4732} step={2} delay={0.1} duration={1.4} />
                </Accent>
              </div>
            </Sheen>
          </Reveal>
          <div className="mt-4 text-base text-white/50">
            <MaskedText step={2} delay={0.45}>
              changes shipped in all
            </MaskedText>
          </div>
        </div>
      </div>

      <Camera shots={VOLUME_SHOTS} className="mt-10">
        <div
          className="relative isolate"
          style={{ transformStyle: "preserve-3d" }}
        >
          <Layer depth={-60} className="absolute -inset-x-16 -inset-y-10">
            <GridBackdrop variant="dots" cell={28} period={10} />
          </Layer>
          <AnnABarChart
            bars={MONTHS}
            colWidth={92}
            gap={18}
            barMax={230}
            delay={0.3}
            focus={PEAKS}
            // The peaks hold the light for one step; the total relights the year.
            focused={step === 1}
            sheenStep={1}
          />
        </div>
      </Camera>

      <p className="mt-7 text-2xl leading-snug text-pretty text-white/85">
        <MaskedText step={1} delay={0.35}>
          March built the surface. July moved the work to the cloud.
        </MaskedText>
      </p>

      <Footnote>
        Changes shipped per calendar month. September is a part month.
      </Footnote>
    </Shell>
  );
}
