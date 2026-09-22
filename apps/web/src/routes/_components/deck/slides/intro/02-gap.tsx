import { cn } from "@eva/ui";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import {
  Body,
  Kicker,
  Reveal,
  Shell,
} from "../../_components/DeckPrimitives";
import { useIntroPalette } from "./_parts";

export function IntroGap() {
  const palette = useIntroPalette();
  return (
    <Shell className={cn("justify-center", palette.surface)}>
      <Reveal>
        <Kicker className={palette.kicker}>The Problem</Kicker>
      </Reveal>

      <BlurWordsTitle
        size="lg"
        lines={["AI coding tools", "are siloed."]}
        delay={0.15}
        className={palette.title}
      />

      <Reveal delay={0.9}>
        <Body className={cn("max-w-3xl", palette.body)}>
          Your context is scattered across chat windows, browser tabs, and
          terminal sessions. Eva brings it together in one unified workspace.
        </Body>
      </Reveal>
    </Shell>
  );
}
