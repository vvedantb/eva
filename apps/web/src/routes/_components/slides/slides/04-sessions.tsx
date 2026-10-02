import {
  SlideShell,
  SlideReveal,
  SlideKicker,
  SlideTitle,
  SlideBullets,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

export function Slide04Sessions() {
  return (
    <SlideShell className="bg-background">
      <SlideReveal>
        <SlideKicker>Sessions</SlideKicker>
      </SlideReveal>
      <SlideReveal delay={0.1}>
        <SlideTitle>Persistent pair-programming</SlideTitle>
      </SlideReveal>
      <SlideStagger step={0} delayChildren={0.3}>
        <SlideItem>
          <SlideBullets
            items={[
              "Agent session that survives page reloads",
              "Talk, iterate, branch, revert — full conversation history",
              "Desktop-quality experience in the browser",
            ]}
          />
        </SlideItem>
      </SlideStagger>
    </SlideShell>
  );
}
