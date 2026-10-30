import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroTitle() {
  const palette = useIntroPalette();
  return (
    <Shell center className={palette.surface}>
      <BlurWordsTitle size="2xl" lines={["Eva"]} delay={0.2} />
    </Shell>
  );
}
