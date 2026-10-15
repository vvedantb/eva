import { cn } from "@eva/ui";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroGap() {
  const palette = useIntroPalette();
  return (
    <Shell className={cn("justify-center", palette.surface)}>
      <BlurWordsTitle
        size="lg"
        lines={["AI coding tools", "are siloed."]}
        delay={0.15}
        className={palette.title}
      />
    </Shell>
  );
}
