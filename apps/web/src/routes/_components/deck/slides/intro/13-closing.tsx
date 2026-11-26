import { cn } from "@eva/ui";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Reveal, Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroClosing() {
  const palette = useIntroPalette();
  return (
    <Shell center className={palette.surface}>
      <BlurWordsTitle size="xl" lines={["Eva"]} />

      <Reveal delay={0.6}>
        <p className={cn("mt-6 font-mono text-sm", palette.muted)}>
          github.com/vvedantb/eva
        </p>
      </Reveal>
    </Shell>
  );
}
