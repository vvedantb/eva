import {
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera, Layer } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { GridBackdrop } from "../../_components/motion";
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
    <Shell className="justify-center py-14">
      <div className="flex items-start justify-between">
        <div>
          <Reveal delay={0.1}>
            <Title size="md">It did not arrive evenly</Title>
          </Reveal>
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
    </Shell>
  );
}
