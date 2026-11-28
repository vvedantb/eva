import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Reveal, Shell, Title } from "../../_components/DeckPrimitives";
import { AnnualOriginTimeline } from "../_parts/AnnualOriginTimeline";

const ORIGIN_SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -50 },
  { rotateX: 4, translateZ: 10, x: -40 },
  { rotateX: 3, translateZ: 20, x: 40 },
  {},
];

export function AnnualOrigin() {
  return (
    <Shell className="py-12">
      <Reveal delay={0.1}>
        <Title size="md">Ten months, five moments</Title>
      </Reveal>

      <div className="flex flex-1 items-center">
        <Camera shots={ORIGIN_SHOTS}>
          <AnnualOriginTimeline />
        </Camera>
      </div>
    </Shell>
  );
}
