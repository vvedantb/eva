import { cn } from "@eva/ui";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Body, Reveal, Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroTitle() {
  const palette = useIntroPalette();
  return (
    <Shell center className={palette.surface}>
      <BlurWordsTitle size="2xl" lines={["Eva"]} delay={0.2} />

      <Reveal delay={0.9}>
        <Body className={cn("text-2xl", palette.body)}>
          An open-source AI dev platform
        </Body>
      </Reveal>
    </Shell>
  );
}
