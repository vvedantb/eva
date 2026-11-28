import { Reveal, Shell, Title } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Spotlight } from "../../_components/motion";
import { MoF1PreviewFrame } from "../_parts/MoF1PreviewFrame";

const SHOTS: readonly CameraShot[] = [
  {},
  {},
  { scale: 1.035, x: 24, y: 4, rotateY: 2 },
];

export function FridayPreview() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Title size="md">See it before it is real</Title>
      </Reveal>

      <div className="flex flex-1 flex-col justify-center pb-8">
        <Reveal delay={0.15} className="relative isolate flex justify-center">
          <Spotlight shots={[null, null, { x: 330, y: 110, size: 520 }]} />
          <Camera shots={SHOTS}>
            <MoF1PreviewFrame />
          </Camera>
        </Reveal>
      </div>
    </Shell>
  );
}
