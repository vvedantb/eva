import { cn } from "@eva/ui";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Body, Reveal, Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroDemo() {
  const palette = useIntroPalette();
  return (
    <Shell center className={palette.surface}>
      <BlurWordsTitle size="xl" lines={["Demo"]} />

      <Reveal delay={0.6}>
        <Body className={cn("text-xl", palette.body)}>
          Let&rsquo;s see it in action.
        </Body>
      </Reveal>
    </Shell>
  );
}
