import { Camera } from "../_components/DeckCamera";
import { Reveal, Shell, Title } from "../_components/DeckPrimitives";
import { Spotlight } from "../_components/motion";
import { RealModelPicker } from "./_parts/RealModelPicker";

/** The light sits under the long list, then settles on the slider. */
const GLOW = [
  { x: 300, y: 300, size: 720 },
  { x: 300, y: 250, size: 620 },
];

/** A small push on the switch, so the simpler picker reads as the answer. */
const SHOTS = [{}, { translateZ: 18 }];

export function Slide05SimpleMode() {
  return (
    <Shell className="py-10">
      <div className="flex flex-1 items-center gap-10">
        <div className="w-[420px] shrink-0">
          <Reveal delay={0.1}>
            <Title size="md">One switch. Less machinery</Title>
          </Reveal>
        </div>

        <div className="relative isolate flex h-[600px] w-[600px] shrink-0 items-center justify-center">
          <Spotlight shots={GLOW} />
          <Camera shots={SHOTS}>
            <Reveal delay={0.35} from="right" distance={40}>
              <RealModelPicker />
            </Reveal>
          </Camera>
        </div>
      </div>
    </Shell>
  );
}
