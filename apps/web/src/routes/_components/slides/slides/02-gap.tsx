import {
  SlideShell,
  SlideReveal,
  SlideKicker,
} from "../_components/SlideShell";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";

export function Slide02Gap() {
  return (
    <SlideShell className="bg-background">
      <SlideReveal>
        <SlideKicker>The Problem</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle
        lines={["AI coding tools", "are siloed."]}
        size="2xl"
        step={0}
        delay={0.15}
      />
      <SlideReveal step={0} delay={0.8}>
        <p className="mt-10 max-w-2xl text-lg leading-relaxed text-foreground/70">
          Your context is scattered across chat windows, browser tabs, and
          terminal sessions. Eva brings it together in one unified workspace.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
