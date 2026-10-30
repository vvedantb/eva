import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Reveal, Shell, Title } from "../../_components/DeckPrimitives";
import { AnnualOriginTimeline } from "../_parts/AnnualOriginTimeline";

/**
 * The camera dollies along the axis as the milestones arrive: pulled back and
 * slightly above the whole span, in towards the January cluster, right to the
 * summer beats, then square on while the closing figures count up.
 */
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
        <Title size="md">Eight months, five moments</Title>
      </Reveal>

      {/* The axis takes the free height, so it sits centred between the
          heading and the closing figures rather than hanging off the title. */}
      <div className="flex flex-1 items-center">
        <Camera shots={ORIGIN_SHOTS}>
          <AnnualOriginTimeline />
        </Camera>
      </div>
    </Shell>
  );
}
