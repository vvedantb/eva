import { cn } from "@eva/ui";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Body, Kicker, Reveal, Shell } from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroInsight() {
  const palette = useIntroPalette();
  return (
    <Shell className={cn("justify-center", palette.surface)}>
      <Reveal>
        <Kicker className={palette.kicker}>Why Eva?</Kicker>
      </Reveal>

      <BlurWordsTitle
        size="lg"
        lines={["Code is cheap.", "Context is expensive."]}
        delay={0.15}
        className={palette.title}
      />

      <Reveal delay={1.6}>
        <Body className={cn("max-w-3xl", palette.body)}>
          Eva preserves your context across tasks, sessions, and projects — so
          you spend less time re-explaining and more time shipping.
        </Body>
      </Reveal>
    </Shell>
  );
}
