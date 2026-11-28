import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Reveal, Shell, Title } from "../../_components/DeckPrimitives";
import { AnnualAdoptionChart } from "../_parts/AnnualAdoptionChart";

const ADOPTION_SHOTS: readonly CameraShot[] = [
  { rotateY: -8, rotateX: 5, translateZ: -20 },
  { rotateY: -4, rotateX: 3, x: 30 },
];

export function AnnualAdoption() {
  return (
    <Shell className="py-12">
      <Reveal delay={0.1}>
        <Title size="md">From one person to the whole team</Title>
      </Reveal>

      <Camera shots={ADOPTION_SHOTS} className="mt-16">
        <AnnualAdoptionChart />
      </Camera>
    </Shell>
  );
}
