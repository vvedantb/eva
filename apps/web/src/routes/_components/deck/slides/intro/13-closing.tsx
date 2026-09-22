import { cn } from "@eva/ui";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Body, Reveal, Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroClosing() {
  const palette = useIntroPalette();
  return (
    <Shell center className={palette.surface}>
      <BlurWordsTitle size="xl" lines={["Eva"]} />

      <Reveal delay={0.6}>
        <Body className={cn("text-xl", palette.body)}>
          Open source · MIT licensed
        </Body>
      </Reveal>

      <Reveal delay={1}>
        <p className={cn("mt-4 font-mono text-sm", palette.muted)}>
          github.com/vvedantb/eva
        </p>
      </Reveal>
    </Shell>
  );
}
