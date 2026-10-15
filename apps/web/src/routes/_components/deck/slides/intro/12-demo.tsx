import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroDemo() {
  const palette = useIntroPalette();
  return (
    <Shell center className={palette.surface}>
      <BlurWordsTitle size="xl" lines={["Demo"]} />
    </Shell>
  );
}
